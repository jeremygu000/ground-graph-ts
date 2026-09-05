-- M4 migration: full-text search support
-- Adds generated tsvector column on chunks, GIN index, and supporting indexes for
-- vector search and citation tracking.

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON chunks USING GIN (tsv);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_document ON chunks (tenant_id, document_version_id);
CREATE INDEX IF NOT EXISTS idx_chunks_content_hash ON chunks (tenant_id, content_hash);

-- HNSW index for cosine distance search on chunk_embeddings
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_vector_hnsw
  ON chunk_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Index for tenant-scoped lookups during retrieval
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_tenant_index
  ON chunk_embeddings (tenant_id, index_version_id);
