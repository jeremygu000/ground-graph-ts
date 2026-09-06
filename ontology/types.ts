import { z } from "zod";
import { JSON_OBJECT_SCHEMA } from "../src/domain/json";

export const EntityTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  attributes: JSON_OBJECT_SCHEMA,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type EntityType = z.infer<typeof EntityTypeSchema>;

export const PredicateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  domainTypes: z.array(z.string()),
  rangeTypes: z.array(z.string()),
  isTransitive: z.boolean().default(false),
  isSymmetric: z.boolean().default(false),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Predicate = z.infer<typeof PredicateSchema>;

export const OntologyConstraintSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  constraintType: z.enum(["entity_uniqueness", "fact_cardinality", "temporal_exclusivity", "custom"]),
  targetEntityType: z.string().optional(),
  targetPredicate: z.string().optional(),
  parameters: JSON_OBJECT_SCHEMA,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OntologyConstraint = z.infer<typeof OntologyConstraintSchema>;

export const OntologyVersionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  version: z.number().int().positive(),
  entityTypes: z.number().int().nonnegative(),
  predicates: z.number().int().nonnegative(),
  constraints: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
  metadata: JSON_OBJECT_SCHEMA,
});

export type OntologyVersion = z.infer<typeof OntologyVersionSchema>;

export const DEFAULT_ONTOLOGY_TYPES = [
  "Service",
  "API",
  "Database",
  "Queue",
  "Topic",
  "Bucket",
  "Function",
  "Container",
  "Cluster",
  "Repository",
  "Document",
  "Person",
  "Team",
  "ADR",
  "Incident",
  "Change",
  "Deployment",
] as const;

export const DEFAULT_PREDICATES = [
  "depends_on",
  "implements",
  "connects_to",
  "deployed_on",
  "owned_by",
  "managed_by",
  "part_of",
  "relates_to",
  "causes",
  "resolves",
  "supersedes",
  "references",
] as const;
