import { z } from "zod";
import { JSON_OBJECT_SCHEMA } from "../json";

export const ConfidenceSchema = z.number().min(0).max(1);

export type Confidence = z.infer<typeof ConfidenceSchema>;

export const FactStatusSchema = z.enum(["candidate", "verified", "rejected", "superseded"]);

export type FactStatus = z.infer<typeof FactStatusSchema>;

export const ExtractionMethodSchema = z.enum(["structured", "rule", "llm", "human"]);

export type ExtractionMethod = z.infer<typeof ExtractionMethodSchema>;

export const CanonicalEntitySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  canonicalName: z.string().min(1),
  entityType: z.string(),
  aliases: z.array(z.string()).default([]),
  attributes: JSON_OBJECT_SCHEMA,
  description: z.string().optional(),
  createdAt: z.iso.datetime(),
  validFrom: z.iso.datetime(),
  validTo: z.iso.datetime().optional(),
  supersededBy: z.uuid().optional(),
  createdBy: z.string().optional(),
  principalIds: z.array(z.uuid()).default([]),
});

export type CanonicalEntity = z.infer<typeof CanonicalEntitySchema>;

export const KnowledgeFactSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    subjectId: z.uuid(),
    predicate: z.string(),
    objectId: z.uuid().optional(),
    objectValue: z.string().optional(),
    status: FactStatusSchema.default("candidate"),
    extractionMethod: ExtractionMethodSchema,
    confidence: ConfidenceSchema,
    validFrom: z.iso.datetime(),
    validTo: z.iso.datetime().optional(),
    observedAt: z.iso.datetime(),
    supersededBy: z.uuid().optional(),
    createdAt: z.iso.datetime(),
    createdBy: z.string().optional(),
    provenance: z.object({
      sourceVersionId: z.uuid(),
      chunkId: z.uuid().optional(),
      evidenceText: z.string().optional(),
    }),
  })
  .superRefine((fact, context) => {
    if (
      fact.validTo !== undefined &&
      new Date(fact.validTo).getTime() <= new Date(fact.validFrom).getTime()
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validTo"],
        message: "validTo must be greater than validFrom",
      });
    }

    if (fact.supersededBy === fact.id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supersededBy"],
        message: "Fact cannot supersede itself",
      });
    }

    if (fact.status === "verified" && !fact.provenance.chunkId && !fact.provenance.evidenceText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance"],
        message: "Verified facts require evidence",
      });
    }
  });

export type KnowledgeFact = z.infer<typeof KnowledgeFactSchema>;

export const EntityMentionSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  mentionText: z.string().min(1),
  normalizedForm: z.string(),
  entityId: z.uuid().optional(),
  sourceChunkId: z.uuid(),
  position: z.object({
    startChar: z.number().int().nonnegative(),
    endChar: z.number().int().nonnegative(),
  }),
  confidence: ConfidenceSchema,
  createdAt: z.iso.datetime(),
});

export type EntityMention = z.infer<typeof EntityMentionSchema>;
