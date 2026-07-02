import type { DocumentRecord } from "../db/types";
import { updateDocumentStatus } from "../db/documents";
import { INDEXING_POLL_INTERVAL_MS, INDEXING_POLL_TIMEOUT_MS, TEXT_CHAT_MODEL } from "./constants";
import type { ChatMessage } from "./chat";
import { createSimulatedTokenStream, transformOpenAiStreamToAppSse } from "./sse";

export function toAiSearchInstanceId(documentId: string): string {
  return documentId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
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

export async function indexTextDocument(env: Env, document: DocumentRecord): Promise<void> {
  const instanceId = toAiSearchInstanceId(document.id);

  try {
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
  } catch (error) {
    console.error("[ai-search.index]", document.id, error);
    await updateDocumentStatus(env.DB, document.id, "failed", {
      errorMessage:
        error instanceof Error ? error.message : "Failed to index document for chat.",
    });

    try {
      await env.AI_SEARCH.delete(instanceId);
    } catch (deleteError) {
      console.warn("[ai-search.delete]", instanceId, deleteError);
    }
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
        "You answer questions about the uploaded document. Be concise and ground answers in the document content.",
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
