import { z } from "zod";

export const SourceTypeSchema = z.enum(["file", "url", "git", "api", "s3"]);

export const SourceDescriptorSchema = z.object({
  type: SourceTypeSchema,
  uri: z.string().min(1),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;

export const ParsedDocumentSchema = z.object({
  sourceId: z.uuid(),
  versionId: z.uuid(),
  title: z.string().optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  extractedAt: z.iso.datetime(),
});

export type ParsedDocument = z.infer<typeof ParsedDocumentSchema>;

export const ChunkSchema = z.object({
  id: z.uuid(),
  documentVersionId: z.uuid(),
  principalId: z.uuid(),
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
  createdAt: z.iso.datetime(),
});

export type Chunk = z.infer<typeof ChunkSchema>;

export const EvidenceReferenceSchema = z.object({
  evidenceId: z.uuid(),
  chunkId: z.uuid(),
  position: z.object({
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }),
  snippet: z.string(),
});

export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
