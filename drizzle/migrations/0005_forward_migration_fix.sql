-- Migration 0005: Forward migration for existing databases
-- Handles upgrade path for databases that may have already run 0002/0003
-- via component test bootstrap but without Drizzle journal entries.
-- All statements are idempotent - safe to re-run.

-- Add principal_id columns if they don't exist (0003 forward fix)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sources' AND column_name = 'principal_id') THEN
    ALTER TABLE sources ADD COLUMN principal_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'principal_id') THEN
    ALTER TABLE documents ADD COLUMN principal_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_versions' AND column_name = 'principal_id') THEN
    ALTER TABLE document_versions ADD COLUMN principal_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chunks' AND column_name = 'principal_id') THEN
    ALTER TABLE chunks ADD COLUMN principal_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chunk_embeddings' AND column_name = 'principal_id') THEN
    ALTER TABLE chunk_embeddings ADD COLUMN principal_id UUID NOT NULL DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Add principal_id indexes if they don't exist (0003 forward fix)
CREATE INDEX IF NOT EXISTS idx_sources_principal_id ON sources(principal_id);
CREATE INDEX IF NOT EXISTS idx_documents_principal_id ON documents(principal_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_principal_id ON document_versions(principal_id);
CREATE INDEX IF NOT EXISTS idx_chunks_principal_id ON chunks(principal_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_principal_id ON chunk_embeddings(principal_id);

-- Add composite ACL indexes if they don't exist (0003 forward fix)
CREATE INDEX IF NOT EXISTS idx_sources_tenant_principal ON sources(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_principal ON documents(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_tenant_principal ON document_versions(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_principal ON chunks(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_tenant_principal ON chunk_embeddings(tenant_id, principal_id);

-- Add fulltext indexes if they don't exist (0002 forward fix)
-- Only chunks and evidence tables have content columns
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON chunks USING gin(to_tsvector('english', content));

-- Ensure single-active index constraint exists (0004 forward fix)
-- Note: Drizzle will report this as applied since the index exists, but the IF NOT EXISTS
-- prevents error if it was already created via 0004
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_versions_single_active
ON index_versions (tenant_id, index_type)
WHERE is_active = true;
