import { updateDocumentStatus } from "../db/documents";
import type { DocumentRecord } from "../db/types";

export const INDEXING_STALE_MS = 90_000;
export const INDEXING_TIMEOUT_MS = 90_000;
export const INDEXING_MAX_ATTEMPTS = 2;

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
  return "Indexing timed out. PDF chat is unreliable in local dev — run pnpm deploy and upload on the deployed URL.";
}

export function isRetryableIndexingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("WebSocket") ||
    message.includes("1006") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}
