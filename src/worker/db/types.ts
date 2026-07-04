export type DocumentPipeline = "text" | "vision";

export type DocumentStatus = "uploading" | "indexing" | "ready" | "failed";

export interface DocumentRecord {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  r2_key: string;
  pipeline: DocumentPipeline;
  ai_search_instance_id: string | null;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  session_id: string | null;
}

export interface CreateDocumentInput {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  r2Key: string;
  pipeline: DocumentPipeline;
  status?: DocumentStatus;
  sessionId?: string | null;
}
