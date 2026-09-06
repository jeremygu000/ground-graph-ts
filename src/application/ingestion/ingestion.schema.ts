import { z } from "zod";

export const IngestDocumentRequestSchema = z.object({
  sourceUri: z.string().url(),
  sourceType: z.enum(["file", "url", "git", "api", "s3"]),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chunkingStrategy: z.enum(["heading", "recursive", "page", "semantic"]).default("heading"),
  maxChunkSize: z.number().int().positive().default(1000),
  chunkOverlap: z.number().int().nonnegative().default(200),
  principalId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export type IngestDocumentRequest = z.infer<typeof IngestDocumentRequestSchema>;

export const IngestDocumentResponseSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  chunksCreated: z.number().int(),
  status: z.enum(["completed", "failed", "partial"]),
  errors: z
    .array(
      z.object({
        stage: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});

export type IngestDocumentResponse = z.infer<typeof IngestDocumentResponseSchema>;

export interface IngestionQualityReport {
  documentId: string;
  versionId: string;
  sourceUri: string;
  qualityMetrics: {
    totalChunks: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
    emptyChunks: number;
    duplicateChunks: number;
    parsingErrors: number;
  };
  ingestedAt: string;
  ingestedBy: string;
}
