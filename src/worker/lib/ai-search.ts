import type { DocumentRecord } from "../db/types";
import { updateDocumentStatus } from "../db/documents";
import { INDEXING_POLL_INTERVAL_MS, INDEXING_POLL_TIMEOUT_MS, TEXT_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import {
  INDEXING_MAX_ATTEMPTS,
  INDEXING_TIMEOUT_MS,
  isRetryableIndexingError,
  sleep,
  withTimeout,
} from "./indexing";
import { createSimulatedTokenStream, transformOpenAiStreamToAppSse } from "./sse";

export function toAiSearchInstanceId(documentId: string): string {
  return documentId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function formatIndexingError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Failed to index document for chat.";
  if (message.includes("WebSocket") || message.includes("1006")) {
    return "PDF indexing failed (AI Search connection error). Deploy with pnpm deploy and upload there.";
  }
  return message;
}

export async function getOrCreateAiSearchInstance(
  env: Env,
  documentId: string,
): Promise<AiSearchInstance> {
  const instanceId = toAiSearchInstanceId(documentId);

  try {
    return await env.AI_SEARCH.create({ id: instanceId });
  } catch (error) {
    console.warn("[ai-search.create] reusing existing instance", instanceId, error);
    return env.AI_SEARCH.get(instanceId);
  }
}

async function runTextDocumentIndexing(
  env: Env,
  document: DocumentRecord,
  instanceId: string,
): Promise<void> {
  const instance = await getOrCreateAiSearchInstance(env, document.id);
  const object = await env.BUCKET.get(document.r2_key);

  if (!object) {
    throw new Error("Uploaded file not found in storage.");
  }

  const item = await instance.items.uploadAndPoll(document.file_name, object.body, {
    pollIntervalMs: INDEXING_POLL_INTERVAL_MS,
    timeoutMs: INDEXING_POLL_TIMEOUT_MS,
  });

  if (item.status !== "completed") {
    throw new Error(`Indexing failed with status: ${item.status}`);
  }

  await updateDocumentStatus(env.DB, document.id, "ready", {
    aiSearchInstanceId: instanceId,
    errorMessage: null,
  });
}

export async function indexTextDocument(env: Env, document: DocumentRecord): Promise<void> {
  const instanceId = toAiSearchInstanceId(document.id);
  let lastError: unknown;

  for (let attempt = 1; attempt <= INDEXING_MAX_ATTEMPTS; attempt++) {
    try {
      await withTimeout(
        runTextDocumentIndexing(env, document, instanceId),
        INDEXING_TIMEOUT_MS,
        "Indexing timed out after 90 seconds.",
      );
      return;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < INDEXING_MAX_ATTEMPTS && isRetryableIndexingError(error);
      if (canRetry) {
        console.warn("[ai-search.index] retrying", document.id, { attempt, error });
        await sleep(2_000 * attempt);
        continue;
      }
      break;
    }
  }

  console.error("[ai-search.index]", document.id, lastError);
  await updateDocumentStatus(env.DB, document.id, "failed", {
    errorMessage: formatIndexingError(lastError),
  });

  try {
    await env.AI_SEARCH.delete(instanceId);
  } catch (deleteError) {
    console.warn("[ai-search.delete]", instanceId, deleteError);
  }
}

export async function deleteAiSearchInstance(env: Env, instanceId: string): Promise<void> {
  try {
    await env.AI_SEARCH.delete(instanceId);
  } catch (error) {
    console.warn("[ai-search.delete]", instanceId, error);
  }
}

export async function streamTextDocumentChat(args: {
  env: Env;
  document: DocumentRecord;
  message: string;
  history: ChatMessage[];
}): Promise<ReadableStream<Uint8Array>> {
  const instanceId =
    args.document.ai_search_instance_id ?? toAiSearchInstanceId(args.document.id);
  const instance = args.env.AI_SEARCH.get(instanceId);

  const messages: AiSearchMessage[] = [
    {
      role: "system",
      content:
        "You answer questions about the uploaded document. Be concise, ground answers in the document content, and format replies in Markdown (bullet lists, headings, and bold where helpful).",
    },
    ...args.history.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: "user", content: args.message },
  ];

  try {
    const source = await instance.chatCompletions({
      messages,
      model: TEXT_CHAT_MODEL,
      stream: true,
    });

    return transformOpenAiStreamToAppSse(source);
  } catch (error) {
    console.error("[ai-search.chat]", args.document.id, error);

    const fallback = await instance.chatCompletions({
      messages,
      model: TEXT_CHAT_MODEL,
    });

    const text =
      fallback.choices?.[0]?.message?.content ??
      "Sorry, I couldn't generate an answer from this document.";

    return createSimulatedTokenStream(text);
  }
}
