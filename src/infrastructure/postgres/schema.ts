import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    uri: text("uri").notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    metadata: jsonb("metadata"),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sources_tenant_id").on(table.tenantId),
    index("idx_sources_uri").on(table.uri),
    uniqueIndex("uq_sources_tenant_uri").on(table.tenantId, table.uri),
  ],
);

export const sourceSyncState = pgTable(
  "source_sync_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    lastCursor: text("last_cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastChangeHash: text("last_change_hash"),
    syncStatus: varchar("sync_status", { length: 50 }).notNull().default("idle"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_source_sync_state_source_id").on(table.sourceId),
    uniqueIndex("uq_source_sync_state_source_id").on(table.sourceId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 1000 }),
    metadata: jsonb("metadata"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_documents_tenant_id").on(table.tenantId),
    index("idx_documents_source_id").on(table.sourceId),
    uniqueIndex("uq_documents_tenant_source").on(table.tenantId, table.sourceId),
  ],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    parsedDocument: jsonb("parsed_document"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("idx_document_versions_document_id").on(table.documentId),
    index("idx_document_versions_tenant_id").on(table.tenantId),
    uniqueIndex("uq_document_versions_document_version").on(table.documentId, table.versionNumber),
    check("chk_version_number_positive", sql`${table.versionNumber} > 0`),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentVersionId: uuid("document_version_id")
      .notNull()
      .references(() => documentVersions.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    locator: jsonb("locator").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_chunks_document_version_id").on(table.documentVersionId),
    index("idx_chunks_tenant_id").on(table.tenantId),
    uniqueIndex("uq_chunks_document_sequence").on(table.documentVersionId, table.sequenceNumber),
    check("chk_sequence_nonnegative", sql`${table.sequenceNumber} >= 0`),
  ],
);

export const indexVersions = pgTable(
  "index_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    indexType: varchar("index_type", { length: 50 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    embeddingModel: varchar("embedding_model", { length: 255 }),
    embeddingDimension: integer("embedding_dimension"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_index_versions_tenant_id").on(table.tenantId),
    uniqueIndex("uq_index_versions_tenant_type_version").on(
      table.tenantId,
      table.indexType,
      table.versionNumber,
    ),
    check("chk_version_positive", sql`${table.versionNumber} > 0`),
  ],
);

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chunkId: uuid("chunk_id")
      .notNull()
      .references(() => chunks.id, { onDelete: "cascade" }),
    indexVersionId: uuid("index_version_id")
      .notNull()
      .references(() => indexVersions.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    embedding: text("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_chunk_embeddings_chunk_id").on(table.chunkId),
    index("idx_chunk_embeddings_index_version_id").on(table.indexVersionId),
    uniqueIndex("uq_chunk_embeddings_chunk_index").on(table.chunkId, table.indexVersionId),
  ],
);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    canonicalName: varchar("canonical_name", { length: 500 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    aliases: jsonb("aliases").default([]),
    attributes: jsonb("attributes").default({}),
    description: text("description"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("idx_entities_tenant_id").on(table.tenantId),
    index("idx_entities_canonical_name").on(table.canonicalName),
    index("idx_entities_entity_type").on(table.entityType),
    uniqueIndex("uq_entities_tenant_name").on(table.tenantId, table.canonicalName),
  ],
);

export const facts = pgTable(
  "facts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    predicate: varchar("predicate", { length: 255 }).notNull(),
    objectId: uuid("object_id").references(() => entities.id, { onDelete: "set null" }),
    objectValue: text("object_value"),
    status: varchar("status", { length: 50 }).notNull().default("candidate"),
    extractionMethod: varchar("extraction_method", { length: 50 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    supersededBy: uuid("superseded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    provenance: jsonb("provenance").notNull(),
  },
  (table) => [
    index("idx_facts_tenant_id").on(table.tenantId),
    index("idx_facts_subject_id").on(table.subjectId),
    index("idx_facts_predicate").on(table.predicate),
    index("idx_facts_status").on(table.status),
    check(
      "chk_valid_to_after_from",
      sql`${table.validTo} IS NULL OR ${table.validTo} > ${table.validFrom}`,
    ),
    check("chk_confidence_range", sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`),
  ],
);

export const entityMentions = pgTable(
  "entity_mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    mentionText: varchar("mention_text", { length: 1000 }).notNull(),
    normalizedForm: varchar("normalized_form", { length: 1000 }).notNull(),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "set null" }),
    sourceChunkId: uuid("source_chunk_id").references(() => chunks.id, { onDelete: "cascade" }),
    position: jsonb("position").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_entity_mentions_tenant_id").on(table.tenantId),
    index("idx_entity_mentions_chunk_id").on(table.sourceChunkId),
    index("idx_entity_mentions_entity_id").on(table.entityId),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sourceVersionId: uuid("source_version_id").notNull(),
    evidenceType: varchar("evidence_type", { length: 50 }).notNull(),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }),
    uri: text("uri"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    verificationMethod: varchar("verification_method", { length: 50 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_evidence_tenant_id").on(table.tenantId),
    index("idx_evidence_source_version_id").on(table.sourceVersionId),
    index("idx_evidence_content_hash").on(table.contentHash),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    questionId: uuid("question_id"),
    factId: uuid("fact_id")
      .notNull()
      .references(() => facts.id, { onDelete: "cascade" }),
    claimText: text("claim_text").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("asserted"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    citations: jsonb("citations").default([]),
  },
  (table) => [
    index("idx_claims_tenant_id").on(table.tenantId),
    index("idx_claims_fact_id").on(table.factId),
    index("idx_claims_question_id").on(table.questionId),
  ],
);

export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    triggerType: varchar("trigger_type", { length: 50 }).notNull().default("manual"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    traceId: varchar("trace_id", { length: 64 }),
    spanId: varchar("span_id", { length: 32 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    versionBundle: jsonb("version_bundle"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_ingestion_runs_tenant_id").on(table.tenantId),
    index("idx_ingestion_runs_source_id").on(table.sourceId),
    index("idx_ingestion_runs_status").on(table.status),
  ],
);

export const ingestionSteps = pgTable(
  "ingestion_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => ingestionRuns.id, { onDelete: "cascade" }),
    stepName: varchar("step_name", { length: 100 }).notNull(),
    stepType: varchar("step_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    retryCount: integer("retry_count").notNull().default(0),
    metadata: jsonb("metadata"),
  },
  (table) => [index("idx_ingestion_steps_run_id").on(table.runId)],
);

export const executionRuns = pgTable(
  "execution_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    workflowName: varchar("workflow_name", { length: 100 }).notNull(),
    workflowVersion: varchar("workflow_version", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    triggerType: varchar("trigger_type", { length: 50 }).notNull().default("manual"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    traceId: varchar("trace_id", { length: 64 }),
    spanId: varchar("span_id", { length: 32 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    versionBundle: jsonb("version_bundle").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_execution_runs_tenant_id").on(table.tenantId),
    index("idx_execution_runs_workflow_name").on(table.workflowName),
    index("idx_execution_runs_status").on(table.status),
  ],
);

export const executionSteps = pgTable(
  "execution_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => executionRuns.id, { onDelete: "cascade" }),
    stepName: varchar("step_name", { length: 100 }).notNull(),
    stepType: varchar("step_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    retryCount: integer("retry_count").notNull().default(0),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_execution_steps_run_id").on(table.runId),
    index("idx_execution_steps_status").on(table.status),
  ],
);

export const executionStepDependencies = pgTable(
  "execution_step_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stepId: uuid("step_id")
      .notNull()
      .references(() => executionSteps.id, { onDelete: "cascade" }),
    dependsOnStepId: uuid("depends_on_step_id")
      .notNull()
      .references(() => executionSteps.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("uq_step_dependency").on(table.stepId, table.dependsOnStepId),
    check("chk_no_self_dependency", sql`${table.stepId} != ${table.dependsOnStepId}`),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    payload: jsonb("payload").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: varchar("claimed_by", { length: 100 }),
    leaseToken: varchar("lease_token", { length: 100 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    error: varchar("error", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_outbox_events_tenant_id").on(table.tenantId),
    index("idx_outbox_events_status").on(table.status),
    index("idx_outbox_events_available_at").on(table.availableAt),
    index("idx_outbox_events_aggregate_id").on(table.aggregateId),
    uniqueIndex("uq_outbox_events_idempotency").on(table.tenantId, table.idempotencyKey),
  ],
);

export const evaluationDatasets = pgTable(
  "evaluation_datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    version: varchar("version", { length: 50 }).notNull(),
    description: text("description"),
    cases: jsonb("cases").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (table) => [uniqueIndex("uq_evaluation_datasets_name_version").on(table.name, table.version)],
);

export const evaluationResults = pgTable(
  "evaluation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => evaluationDatasets.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => executionRuns.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    metrics: jsonb("metrics").notNull().default([]),
    response: jsonb("response"),
    latencyMs: integer("latency_ms"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull(),
    versionBundle: jsonb("version_bundle").notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    index("idx_evaluation_results_case_id").on(table.caseId),
    index("idx_evaluation_results_run_id").on(table.runId),
    index("idx_evaluation_results_status").on(table.status),
  ],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type NewDocumentVersion = typeof documentVersions.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;
export type Fact = typeof facts.$inferSelect;
export type NewFact = typeof facts.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
