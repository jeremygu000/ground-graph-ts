-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create sources table
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  uri TEXT NOT NULL,
  mime_type VARCHAR(255),
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_tenant_id ON sources(tenant_id);
CREATE INDEX idx_sources_uri ON sources(uri);
CREATE UNIQUE INDEX uq_sources_tenant_uri ON sources(tenant_id, uri);

-- Create source_sync_state table
CREATE TABLE source_sync_state (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  last_cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_change_hash TEXT,
  sync_status VARCHAR(50) NOT NULL DEFAULT 'idle',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_source_sync_state_source_id ON source_sync_state(source_id);
CREATE UNIQUE INDEX uq_source_sync_state_source_id ON source_sync_state(source_id);

-- Create documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title VARCHAR(1000),
  metadata JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_source_id ON documents(source_id);
CREATE UNIQUE INDEX uq_documents_tenant_source ON documents(tenant_id, source_id);

-- Create document_versions table
CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  size_bytes INTEGER NOT NULL,
  parsed_document JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  CONSTRAINT chk_version_number_positive CHECK (version_number > 0)
);

CREATE INDEX idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX idx_document_versions_tenant_id ON document_versions(tenant_id);
CREATE UNIQUE INDEX uq_document_versions_document_version ON document_versions(document_id, version_number);

-- Create chunks table
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_version_id UUID NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  sequence_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  locator JSONB NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sequence_nonnegative CHECK (sequence_number >= 0)
);

CREATE INDEX idx_chunks_document_version_id ON chunks(document_version_id);
CREATE INDEX idx_chunks_tenant_id ON chunks(tenant_id);
CREATE UNIQUE INDEX uq_chunks_document_sequence ON chunks(document_version_id, sequence_number);

-- Create index_versions table
CREATE TABLE index_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  index_type VARCHAR(50) NOT NULL,
  version_number INTEGER NOT NULL,
  embedding_model VARCHAR(255),
  embedding_dimension INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_version_positive CHECK (version_number > 0)
);

CREATE INDEX idx_index_versions_tenant_id ON index_versions(tenant_id);
CREATE UNIQUE INDEX uq_index_versions_tenant_type_version ON index_versions(tenant_id, index_type, version_number);

-- Create chunk_embeddings table with vector column
CREATE TABLE chunk_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  index_version_id UUID NOT NULL REFERENCES index_versions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  embedding VECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunk_embeddings_chunk_id ON chunk_embeddings(chunk_id);
CREATE INDEX idx_chunk_embeddings_index_version_id ON chunk_embeddings(index_version_id);
CREATE UNIQUE INDEX uq_chunk_embeddings_chunk_index ON chunk_embeddings(chunk_id, index_version_id);

-- Create entities table
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  canonical_name VARCHAR(500) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  aliases JSONB DEFAULT '[]',
  attributes JSONB DEFAULT '{}',
  description TEXT,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE INDEX idx_entities_tenant_id ON entities(tenant_id);
CREATE INDEX idx_entities_canonical_name ON entities(canonical_name);
CREATE INDEX idx_entities_entity_type ON entities(entity_type);
CREATE UNIQUE INDEX uq_entities_tenant_name ON entities(tenant_id, canonical_name);

-- Create facts table
CREATE TABLE facts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  subject_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  predicate VARCHAR(255) NOT NULL,
  object_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  object_value TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'candidate',
  extraction_method VARCHAR(50) NOT NULL,
  confidence DECIMAL(5, 4),
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  observed_at TIMESTAMPTZ NOT NULL,
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  provenance JSONB NOT NULL,
  CONSTRAINT chk_valid_to_after_from CHECK (valid_to IS NULL OR valid_to > valid_from),
  CONSTRAINT chk_confidence_range CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_facts_tenant_id ON facts(tenant_id);
CREATE INDEX idx_facts_subject_id ON facts(subject_id);
CREATE INDEX idx_facts_predicate ON facts(predicate);
CREATE INDEX idx_facts_status ON facts(status);

-- Create entity_mentions table
CREATE TABLE entity_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  mention_text VARCHAR(1000) NOT NULL,
  normalized_form VARCHAR(1000) NOT NULL,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  source_chunk_id UUID REFERENCES chunks(id) ON DELETE CASCADE,
  position JSONB NOT NULL,
  confidence DECIMAL(5, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entity_mentions_tenant_id ON entity_mentions(tenant_id);
CREATE INDEX idx_entity_mentions_chunk_id ON entity_mentions(source_chunk_id);
CREATE INDEX idx_entity_mentions_entity_id ON entity_mentions(entity_id);

-- Create evidence table
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  source_version_id UUID NOT NULL,
  evidence_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  mime_type VARCHAR(255),
  uri TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  verification_method VARCHAR(50),
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX idx_evidence_tenant_id ON evidence(tenant_id);
CREATE INDEX idx_evidence_source_version_id ON evidence(source_version_id);
CREATE INDEX idx_evidence_content_hash ON evidence(content_hash);

-- Create claims table
CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  question_id UUID,
  fact_id UUID NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  claim_text TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'asserted',
  confidence DECIMAL(5, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  citations JSONB DEFAULT '[]'
);

CREATE INDEX idx_claims_tenant_id ON claims(tenant_id);
CREATE INDEX idx_claims_fact_id ON claims(fact_id);
CREATE INDEX idx_claims_question_id ON claims(question_id);

-- Create ingestion_runs table
CREATE TABLE ingestion_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  input JSONB,
  output JSONB,
  error TEXT,
  trace_id VARCHAR(64),
  span_id VARCHAR(32),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  version_bundle JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ingestion_runs_tenant_id ON ingestion_runs(tenant_id);
CREATE INDEX idx_ingestion_runs_source_id ON ingestion_runs(source_id);
CREATE INDEX idx_ingestion_runs_status ON ingestion_runs(status);

-- Create ingestion_steps table
CREATE TABLE ingestion_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES ingestion_runs(id) ON DELETE CASCADE,
  step_name VARCHAR(100) NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);

CREATE INDEX idx_ingestion_steps_run_id ON ingestion_steps(run_id);

-- Create execution_runs table
CREATE TABLE execution_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  workflow_name VARCHAR(100) NOT NULL,
  workflow_version VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  input JSONB,
  output JSONB,
  error TEXT,
  trace_id VARCHAR(64),
  span_id VARCHAR(32),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  version_bundle JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_execution_runs_tenant_id ON execution_runs(tenant_id);
CREATE INDEX idx_execution_runs_workflow_name ON execution_runs(workflow_name);
CREATE INDEX idx_execution_runs_status ON execution_runs(status);

-- Create execution_steps table
CREATE TABLE execution_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  step_name VARCHAR(100) NOT NULL,
  step_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  input JSONB,
  output JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);

CREATE INDEX idx_execution_steps_run_id ON execution_steps(run_id);
CREATE INDEX idx_execution_steps_status ON execution_steps(status);

-- Create execution_step_dependencies table
CREATE TABLE execution_step_dependencies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
  depends_on_step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
  CONSTRAINT chk_no_self_dependency CHECK (step_id != depends_on_step_id)
);

CREATE UNIQUE INDEX uq_step_dependency ON execution_step_dependencies(step_id, depends_on_step_id);

-- Create outbox_events table
CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by VARCHAR(100),
  lease_token VARCHAR(100),
  completed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  error VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_events_tenant_id ON outbox_events(tenant_id);
CREATE INDEX idx_outbox_events_status ON outbox_events(status);
CREATE INDEX idx_outbox_events_available_at ON outbox_events(available_at);
CREATE INDEX idx_outbox_events_aggregate_id ON outbox_events(aggregate_id);
CREATE UNIQUE INDEX uq_outbox_events_idempotency ON outbox_events(tenant_id, idempotency_key);

-- Create evaluation_datasets table
CREATE TABLE evaluation_datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  cases JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

CREATE UNIQUE INDEX uq_evaluation_datasets_name_version ON evaluation_datasets(name, version);

-- Create evaluation_results table
CREATE TABLE evaluation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES evaluation_datasets(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  metrics JSONB NOT NULL DEFAULT '[]',
  response JSONB,
  latency_ms INTEGER,
  cost_usd DECIMAL(10, 6),
  evaluated_at TIMESTAMPTZ NOT NULL,
  version_bundle JSONB NOT NULL,
  metadata JSONB
);

CREATE INDEX idx_evaluation_results_case_id ON evaluation_results(case_id);
CREATE INDEX idx_evaluation_results_run_id ON evaluation_results(run_id);
CREATE INDEX idx_evaluation_results_status ON evaluation_results(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_source_sync_state_updated_at
  BEFORE UPDATE ON source_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outbox_events_updated_at
  BEFORE UPDATE ON outbox_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
