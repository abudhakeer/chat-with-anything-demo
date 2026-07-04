ALTER TABLE documents ADD COLUMN session_id TEXT;

CREATE INDEX idx_documents_session_created ON documents(session_id, created_at);
