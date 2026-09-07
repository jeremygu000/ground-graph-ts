import { z } from "zod";

export const DocumentStatusSchema = z.enum(["active", "inactive"]);
export const DocumentTypeSchema = z.enum(["file", "url", "git", "api", "s3"]);

export const DocumentSummarySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  title: z.string().nullable(),
  documentType: DocumentTypeSchema,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ListDocumentsRequestSchema = z.object({
  tenantId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const ListDocumentsResponseSchema = z.object({
  documents: z.array(DocumentSummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const GetDocumentRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  includeVersions: z.boolean().optional().default(false),
});

export const DocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  versionNumber: z.number().int().positive(),
  contentHash: z.string(),
  checksum: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
});

export const GetDocumentResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceId: z.string().uuid(),
  title: z.string().nullable(),
  documentType: DocumentTypeSchema,
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  versions: z.array(DocumentVersionSchema).optional(),
});

export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
export type ListDocumentsRequest = z.infer<typeof ListDocumentsRequestSchema>;
export type ListDocumentsResponse = z.infer<typeof ListDocumentsResponseSchema>;
export type GetDocumentRequest = z.infer<typeof GetDocumentRequestSchema>;
export type GetDocumentResponse = z.infer<typeof GetDocumentResponseSchema>;
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;
