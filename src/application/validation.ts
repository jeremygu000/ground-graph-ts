import { z } from "zod";

export const SourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.enum(["file", "url", "git", "api"]),
  uri: z.string().url(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean(),
  lastSyncedAt: z.string().datetime().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceInput = z.infer<typeof SourceSchema>;

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
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
  createdAt: z.string().datetime(),
  createdBy: z.string().uuid().optional(),
});

export const ChunkSchema = z.object({
  id: z.string().uuid(),
  documentVersionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  sequenceNumber: z.number().int().nonnegative(),
  content: z.string(),
  contentHash: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
