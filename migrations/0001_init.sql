CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  pipeline TEXT NOT NULL CHECK (pipeline IN ('text', 'vision')),
  ai_search_instance_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (
    status IN ('uploading', 'indexing', 'ready', 'failed')
  ),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created ON documents(created_at);
CREATE INDEX idx_documents_expires ON documents(expires_at);
