-- Migration: Add principal_id columns for ACL propagation (M3)
-- Adds principal_id to sources, documents, document_versions, chunks, and chunk_embeddings tables
-- to track which principal created/owns each entity for pre-retrieval ACL filtering.

ALTER TABLE sources ADD COLUMN principal_id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE documents ADD COLUMN principal_id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE document_versions ADD COLUMN principal_id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE chunks ADD COLUMN principal_id UUID NOT NULL DEFAULT uuid_generate_v4();
ALTER TABLE chunk_embeddings ADD COLUMN principal_id UUID NOT NULL DEFAULT uuid_generate_v4();

CREATE INDEX idx_sources_principal_id ON sources(principal_id);
CREATE INDEX idx_documents_principal_id ON documents(principal_id);
CREATE INDEX idx_document_versions_principal_id ON document_versions(principal_id);
CREATE INDEX idx_chunks_principal_id ON chunks(principal_id);
CREATE INDEX idx_chunk_embeddings_principal_id ON chunk_embeddings(principal_id);

-- Composite indexes for ACL pre-filter (tenant + principal)
CREATE INDEX idx_sources_tenant_principal ON sources(tenant_id, principal_id);
CREATE INDEX idx_documents_tenant_principal ON documents(tenant_id, principal_id);
CREATE INDEX idx_document_versions_tenant_principal ON document_versions(tenant_id, principal_id);
CREATE INDEX idx_chunks_tenant_principal ON chunks(tenant_id, principal_id);
CREATE INDEX idx_chunk_embeddings_tenant_principal ON chunk_embeddings(tenant_id, principal_id);

-- Prevent multiple active index versions per tenant/type (M4 P1 fix)
CREATE UNIQUE INDEX idx_index_versions_single_active
ON index_versions (tenant_id, index_type) 
WHERE is_active = true;
