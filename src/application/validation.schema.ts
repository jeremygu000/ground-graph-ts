import { z } from "zod";
import { ParsedDocumentSchema, SourceTypeSchema } from "../domain/documents/documents.schema";

export const SourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  type: SourceTypeSchema,
  uri: z.string().url(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean(),
  lastSyncedAt: z.string().optional().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceInput = z.infer<typeof SourceSchema>;

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
