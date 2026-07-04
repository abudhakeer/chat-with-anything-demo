import type { DocumentRecord } from "../db/types";
import { updateDocumentStatus } from "../db/documents";
import { INDEXING_TIMEOUT_MS, withTimeout } from "./indexing";

// The raw PDF stays at document.r2_key (needed for the preview panel).
// Extracted text is stored alongside it so chat can read plain text instead
// of re-parsing the PDF on every message.
export function extractedTextKey(document: DocumentRecord): string {
  return `${document.r2_key}.extracted.md`;
}

async function runPdfExtraction(env: Env, document: DocumentRecord): Promise<void> {
  const object = await env.BUCKET.get(document.r2_key);
  if (!object) {
    throw new Error("Uploaded file not found in storage.");
  }

  const blob = await object.blob();
  const result = await env.AI.toMarkdown({ name: document.file_name, blob });

  if (result.format === "error") {
    throw new Error(`PDF text extraction failed: ${result.error}`);
  }

  await env.BUCKET.put(extractedTextKey(document), result.data, {
    httpMetadata: { contentType: "text/markdown" },
  });

  await updateDocumentStatus(env.DB, document.id, "ready", { errorMessage: null });
}

export async function extractPdfDocument(env: Env, document: DocumentRecord): Promise<void> {
  try {
    await withTimeout(
      runPdfExtraction(env, document),
      INDEXING_TIMEOUT_MS,
      `PDF text extraction timed out after ${INDEXING_TIMEOUT_MS / 1000} seconds.`,
    );
  } catch (error) {
    console.error("[pdf-extract]", document.id, error);
    await updateDocumentStatus(env.DB, document.id, "failed", {
      errorMessage:
        error instanceof Error ? error.message : "Failed to process this PDF for chat.",
    });
  }
}
