import { z } from "zod";

export const SourceTypeSchema = z.enum(["file", "url", "git", "api", "s3"]);
export const ChunkingStrategySchema = z.enum(["heading", "recursive", "page", "semantic"]);

export const IngestRequestSchema = z.object({
  sourceUri: z.string().url().or(z.string().min(1)),
  sourceType: SourceTypeSchema,
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  chunkingStrategy: ChunkingStrategySchema.optional(),
  maxChunkSize: z.number().int().positive().max(10000).optional(),
  chunkOverlap: z.number().int().nonnegative().max(1000).optional(),
});

export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestResponseSchema = z.object({
  documentId: z.string(),
  versionId: z.string(),
  versionNumber: z.number().int().positive(),
  status: z.enum(["created", "updated", "unchanged"]),
  chunksCreated: z.number().int().nonnegative(),
  qualityReport: z.object({
    totalChunks: z.number().int().nonnegative(),
    avgChunkSize: z.number(),
    extractionMethods: z.record(z.string(), z.unknown()),
    entityCount: z.number().int().nonnegative(),
    factCount: z.number().int().nonnegative(),
  }),
  traceId: z.string().optional(),
});

export type IngestResponse = z.infer<typeof IngestResponseSchema>;
