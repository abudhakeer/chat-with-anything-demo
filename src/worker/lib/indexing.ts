import { updateDocumentStatus } from "../db/documents";
import type { DocumentRecord } from "../db/types";

// Backend gives up on PDF text extraction after INDEXING_TIMEOUT_MS and
// writes the final status to D1. INDEXING_STALE_MS must stay comfortably
// above that so the client never marks a document "failed" before the
// backend has had a chance to record the real outcome.
export const INDEXING_TIMEOUT_MS = 60_000;
export const INDEXING_STALE_MS = 75_000;

export function parseDocumentTimestamp(value: string): number {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return Date.parse(normalized);
}

export function isIndexingStale(updatedAt: string, nowMs: number): boolean {
  const startedAt = parseDocumentTimestamp(updatedAt);
  if (!Number.isFinite(startedAt)) {
    return false;
  }
  return nowMs - startedAt >= INDEXING_STALE_MS;
}

export function staleIndexingErrorMessage(): string {
  return "Indexing is taking longer than expected and may have failed. Please try again, or try a smaller PDF.";
}

export async function resolveStaleIndexing(
  db: D1Database,
  document: DocumentRecord,
  nowMs: number,
): Promise<DocumentRecord> {
  if (document.status !== "indexing" || !isIndexingStale(document.updated_at, nowMs)) {
    return document;
  }

  const failed = await updateDocumentStatus(db, document.id, "failed", {
    errorMessage: staleIndexingErrorMessage(),
  });

  return failed ?? document;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
