import { z } from "zod";

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

function nullableString(val: unknown): string | null | undefined {
  if (val === null) return null;
  if (val === undefined) return undefined;
  return toISOString(val);
}

export const SourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.enum(["file", "url", "git", "api"]),
  uri: z.string().url(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean(),
  lastSyncedAt: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceInput = z.infer<typeof SourceSchema>;

export function mapToSource(row: Record<string, unknown>): SourceInput {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    type: row.type as "file" | "url" | "git" | "api",
    uri: String(row.uri),
    mimeType: row.mimeType as string | undefined,
    metadata: row.metadata as Record<string, unknown> | undefined,
    isActive: Boolean(row.isActive),
    lastSyncedAt: nullableString(row.lastSyncedAt) ?? undefined,
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };
}

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  tenantId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  contentHash: z.string(),
  checksum: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  parsedDocument: z.unknown().optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().uuid().optional(),
});

export function mapToDocumentVersion(
  row: Record<string, unknown>,
): z.infer<typeof DocumentVersionSchema> {
  return {
    id: String(row.id),
    documentId: String(row.documentId),
    tenantId: String(row.tenantId),
    versionNumber: Number(row.versionNumber),
    contentHash: String(row.contentHash),
    checksum: String(row.checksum),
    sizeBytes: Number(row.sizeBytes),
    parsedDocument: row.parsedDocument as z.infer<typeof DocumentVersionSchema>["parsedDocument"],
    isActive: Boolean(row.isActive),
    createdAt: toISOString(row.createdAt),
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
  };
}

export const ChunkSchema = z.object({
  id: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  content: z.string(),
  contentHash: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

export function mapToChunk(row: Record<string, unknown>): z.infer<typeof ChunkSchema> {
  return {
    id: String(row.id),
    documentVersionId: String(row.documentVersionId),
    tenantId: String(row.tenantId),
    sequenceNumber: Number(row.sequenceNumber),
    content: String(row.content),
    contentHash: String(row.contentHash),
    metadata: row.metadata as Record<string, unknown> | undefined,
    createdAt: toISOString(row.createdAt),
  };
}

export const OutboxEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  aggregateType: z.string(),
  aggregateId: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  status: z.enum(["pending", "claimed", "completed", "dead_letter"]),
  attempts: z.number().int().nonnegative(),
  availableAt: z.string(),
  claimedAt: z.string().optional(),
  claimedBy: z.string().optional(),
  leaseToken: z.string().optional(),
  completedAt: z.string().optional(),
  deadLetteredAt: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OutboxEventInput = z.infer<typeof OutboxEventSchema>;

export function mapToOutboxEvent(row: Record<string, unknown>): OutboxEventInput {
  const result: Record<string, unknown> = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    aggregateType: String(row.aggregateType),
    aggregateId: String(row.aggregateId),
    eventType: String(row.eventType),
    payload: row.payload as Record<string, unknown>,
    idempotencyKey: String(row.idempotencyKey),
    status: String(row.status) as "pending" | "claimed" | "completed" | "dead_letter",
    attempts: Number(row.attempts),
    availableAt: toISOString(row.availableAt),
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };

  if (row.claimedAt != null) result.claimedAt = toISOString(row.claimedAt);
  if (row.claimedBy != null) result.claimedBy = String(row.claimedBy);
  if (row.leaseToken != null) result.leaseToken = String(row.leaseToken);
  if (row.completedAt != null) result.completedAt = toISOString(row.completedAt);
  if (row.deadLetteredAt != null) result.deadLetteredAt = toISOString(row.deadLetteredAt);
  if (row.error != null) result.error = String(row.error);

  return result as OutboxEventInput;
}
