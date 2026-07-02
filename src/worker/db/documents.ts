import type {
  CreateDocumentInput,
  DocumentPipeline,
  DocumentRecord,
  DocumentStatus,
} from "./types";

const DOCUMENT_COLUMNS =
  "id, file_name, mime_type, size_bytes, r2_key, pipeline, ai_search_instance_id, status, error_message, created_at, updated_at, expires_at";

function mapRow(row: Record<string, unknown>): DocumentRecord {
  return {
    id: String(row.id),
    file_name: String(row.file_name),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes),
    r2_key: String(row.r2_key),
    pipeline: row.pipeline as DocumentPipeline,
    ai_search_instance_id:
      row.ai_search_instance_id === null || row.ai_search_instance_id === undefined
        ? null
        : String(row.ai_search_instance_id),
    status: row.status as DocumentStatus,
    error_message:
      row.error_message === null || row.error_message === undefined
        ? null
        : String(row.error_message),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    expires_at: String(row.expires_at),
  };
}

function expiresAtFromNow(): string {
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

export async function createDocument(
  db: D1Database,
  input: CreateDocumentInput,
): Promise<DocumentRecord> {
  const status = input.status ?? "uploading";
  const expiresAt = expiresAtFromNow();

  await db
    .prepare(
      `INSERT INTO documents (
        id, file_name, mime_type, size_bytes, r2_key, pipeline, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.id,
      input.fileName,
      input.mimeType,
      input.sizeBytes,
      input.r2Key,
      input.pipeline,
      status,
      expiresAt,
    )
    .run();

  const created = await getDocument(db, input.id);
  if (!created) {
    throw new Error("Failed to create document record");
  }
  return created;
}

export async function getDocument(
  db: D1Database,
  id: string,
): Promise<DocumentRecord | null> {
  const row = await db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();

  return row ? mapRow(row) : null;
}

export async function updateDocumentStatus(
  db: D1Database,
  id: string,
  status: DocumentStatus,
  options?: {
    errorMessage?: string | null;
    aiSearchInstanceId?: string | null;
  },
): Promise<DocumentRecord | null> {
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const values: Array<string | null> = [status];

  if (options && "errorMessage" in options) {
    sets.push("error_message = ?");
    values.push(options.errorMessage ?? null);
  }

  if (options && "aiSearchInstanceId" in options) {
    sets.push("ai_search_instance_id = ?");
    values.push(options.aiSearchInstanceId ?? null);
  }

  values.push(id);

  await db
    .prepare(`UPDATE documents SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return getDocument(db, id);
}

export async function findExpiredDocuments(
  db: D1Database,
  nowIso: string,
): Promise<DocumentRecord[]> {
  const result = await db
    .prepare(
      `SELECT ${DOCUMENT_COLUMNS}
       FROM documents
       WHERE expires_at <= ?
       ORDER BY expires_at ASC`,
    )
    .bind(nowIso)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(mapRow);
}

export async function deleteDocument(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM documents WHERE id = ?").bind(id).run();
}

export function toDocumentResponse(doc: DocumentRecord) {
  return {
    id: doc.id,
    fileName: doc.file_name,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    r2Key: doc.r2_key,
    pipeline: doc.pipeline,
    status: doc.status,
    previewUrl: `/api/v1/documents/${doc.id}/preview`,
    error: doc.error_message,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    expiresAt: doc.expires_at,
  };
}
