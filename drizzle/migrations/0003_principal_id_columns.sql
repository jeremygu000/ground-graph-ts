-- Migration: Add principal_id columns for ACL propagation (M3)
-- Adds principal_id to sources, documents, document_versions, chunks, and chunk_embeddings tables
-- to track which principal created/owns each entity for pre-retrieval ACL filtering.
-- Uses IF NOT EXISTS for idempotency in existing databases.

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

CREATE INDEX IF NOT EXISTS idx_sources_principal_id ON sources(principal_id);
CREATE INDEX IF NOT EXISTS idx_documents_principal_id ON documents(principal_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_principal_id ON document_versions(principal_id);
CREATE INDEX IF NOT EXISTS idx_chunks_principal_id ON chunks(principal_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_principal_id ON chunk_embeddings(principal_id);

-- Composite indexes for ACL pre-filter (tenant + principal)
CREATE INDEX IF NOT EXISTS idx_sources_tenant_principal ON sources(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_principal ON documents(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_tenant_principal ON document_versions(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant_principal ON chunks(tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_tenant_principal ON chunk_embeddings(tenant_id, principal_id);
