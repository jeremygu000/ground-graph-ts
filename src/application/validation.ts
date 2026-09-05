import { z } from "zod";
import { validateOrThrow } from "../domain/validation";
import { ParsedDocumentSchema } from "../domain/documents/types";
import type { DocumentVersion } from "./ingestion/ports";

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

function undefinedIfNull<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

export const SourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
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
    principalId: String(row.principalId),
    type: row.type as "file" | "url" | "git" | "api",
    uri: String(row.uri),
    mimeType: undefinedIfNull(row.mimeType as string | null | undefined),
    metadata: undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined),
    isActive: Boolean(row.isActive),
    lastSyncedAt: nullableString(row.lastSyncedAt) ?? undefined,
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };
}

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
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
  principalId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  contentHash: z.string(),
  checksum: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  parsedDocument: ParsedDocumentSchema.optional(),
  isActive: z.boolean(),
  createdAt: z.string(),
  createdBy: z.string().uuid().optional(),
});

export function mapToDocumentVersion(row: Record<string, unknown>): DocumentVersion {
  const result: z.input<typeof DocumentVersionSchema> = {
    id: String(row.id),
    documentId: String(row.documentId),
    tenantId: String(row.tenantId),
    principalId: String(row.principalId),
    versionNumber: Number(row.versionNumber),
    contentHash: String(row.contentHash),
    checksum: String(row.checksum),
    sizeBytes: Number(row.sizeBytes),
    parsedDocument:
      row.parsedDocument === null || row.parsedDocument === undefined
        ? undefined
        : (row.parsedDocument as z.input<typeof ParsedDocumentSchema>),
    isActive: Boolean(row.isActive),
    createdAt: toISOString(row.createdAt),
  };

  if (row.createdBy != null) {
    result.createdBy = String(row.createdBy);
  }

  const validated = validateOrThrow(DocumentVersionSchema, result, "DocumentVersion");
  return validated as DocumentVersion;
}

export const ChunkSchema = z.object({
  id: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  principalId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  content: z.string(),
  contentHash: z.string(),
  locator: z.object({
    type: z.enum(["line", "heading", "page", "section"]),
    path: z.string(),
    startLine: z.number().int().nonnegative().optional(),
    endLine: z.number().int().nonnegative().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

export function mapToChunk(row: Record<string, unknown>) {
  const result = {
    id: String(row.id),
    documentVersionId: String(row.documentVersionId),
    principalId: String(row.principalId),
    tenantId: String(row.tenantId),
    sequenceNumber: Number(row.sequenceNumber),
    content: String(row.content),
    contentHash: String(row.contentHash),
    locator: row.locator as z.infer<typeof ChunkSchema>["locator"],
    metadata: undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined),
    createdAt: toISOString(row.createdAt),
  };

  return validateOrThrow(ChunkSchema, result, "Chunk") as z.infer<typeof ChunkSchema>;
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

  return validateOrThrow(OutboxEventSchema, result, "OutboxEvent");
}
