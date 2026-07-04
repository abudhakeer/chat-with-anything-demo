export type StoredMessageRole = "user" | "assistant";

export type StoredMessageRecord = {
  id: string;
  document_id: string;
  role: StoredMessageRole;
  content: string;
  created_at: string;
};

export type StoredMessageInput = {
  id: string;
  documentId: string;
  role: StoredMessageRole;
  content: string;
};

function mapRow(row: Record<string, unknown>): StoredMessageRecord {
  return {
    id: String(row.id),
    document_id: String(row.document_id),
    role: row.role as StoredMessageRole,
    content: String(row.content),
    created_at: String(row.created_at),
  };
}

export function buildMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}

export async function insertMessage(
  db: D1Database,
  input: StoredMessageInput,
): Promise<StoredMessageRecord> {
  await db
    .prepare(
      `INSERT INTO messages (id, document_id, role, content)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.id, input.documentId, input.role, input.content)
    .run();

  const row = await db
    .prepare(
      `SELECT id, document_id, role, content, created_at
       FROM messages
       WHERE id = ?`,
    )
    .bind(input.id)
    .first<Record<string, unknown>>();

  if (!row) {
    throw new Error("Failed to insert message");
  }

  return mapRow(row);
}

export async function listMessagesByDocument(
  db: D1Database,
  documentId: string,
): Promise<StoredMessageRecord[]> {
  const result = await db
    .prepare(
      `SELECT id, document_id, role, content, created_at
       FROM messages
       WHERE document_id = ?
       ORDER BY created_at ASC`,
    )
    .bind(documentId)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(mapRow);
}

export async function deleteMessagesByDocument(
  db: D1Database,
  documentId: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM messages WHERE document_id = ?")
    .bind(documentId)
    .run();
}

export function toMessageResponse(message: StoredMessageRecord) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
  };
}
