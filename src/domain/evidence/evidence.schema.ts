import { z } from "zod";

export const EvidenceStatusSchema = z.enum(["pending", "verified", "rejected", "disputed"]);

export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  evidenceType: z.enum(["document", "chunk", "fact", "external"]),
  content: z.string(),
  contentHash: z.string(),
  mimeType: z.string().optional(),
  uri: z.string().optional(),
  status: EvidenceStatusSchema,
  verificationMethod: z.enum(["automated", "human", "model"]).optional(),
  verifiedAt: z.string().datetime().optional(),
  verifiedBy: z.string().optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Evidence = z.infer<typeof EvidenceSchema>;

export const CitationSchema = z.object({
  claimId: z.string().uuid(),
  evidenceId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  position: z.object({
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }),
  snippet: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Citation = z.infer<typeof CitationSchema>;

export const ClaimSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  questionId: z.string().uuid().optional(),
  factId: z.string().uuid(),
  claimText: z.string(),
  status: z.enum(["asserted", "supported", "refuted", "uncertain"]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
  citations: z.array(CitationSchema).default([]),
});

export type Claim = z.infer<typeof ClaimSchema>;
