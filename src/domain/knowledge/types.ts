import { z } from "zod";

export const ConfidenceSchema = z.number().min(0).max(1);

export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FactStatusSchema = z.enum(["candidate", "verified", "rejected", "superseded"]);

export type FactStatus = z.infer<typeof FactStatusSchema>;

export const ExtractionMethodSchema = z.enum(["structured", "rule", "llm", "human"]);

export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

export const CanonicalEntitySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  canonicalName: z.string().min(1),
  entityType: z.string(),
  aliases: z.array(z.string()).default([]),
  attributes: z.record(z.string(), z.unknown()),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  supersededBy: z.string().uuid().optional(),
  createdBy: z.string().optional(),
});

export type CanonicalEntity = z.infer<typeof CanonicalEntitySchema>;

export const KnowledgeFactSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  subjectId: z.string().uuid(),
  predicate: z.string(),
  objectId: z.string().uuid().optional(),
  objectValue: z.string().optional(),
  status: FactStatusSchema,
  extractionMethod: ExtractionMethodSchema,
  confidence: ConfidenceSchema,
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().optional(),
  observedAt: z.string().datetime(),
  supersededBy: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
  provenance: z.object({
    sourceVersionId: z.string().uuid(),
    chunkId: z.string().uuid().optional(),
    evidenceText: z.string().optional(),
  }),
});

export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;

export const EntityMentionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  mentionText: z.string().min(1),
  normalizedForm: z.string(),
  entityId: z.string().uuid(),
  sourceChunkId: z.string().uuid(),
  position: z.object({
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }),
  confidence: ConfidenceSchema,
  createdAt: z.string().datetime(),
});

export type EntityMention = z.infer<typeof EntityMentionSchema>;
