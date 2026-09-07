import { z } from "zod";

export const QueryStrategySchema = z.enum(["vector", "graph", "hybrid", "fulltext"]);

export const QueryFiltersSchema = z
  .object({
    documentIds: z.array(z.string().uuid()).optional(),
    entityTypes: z.array(z.string()).optional(),
    factStatuses: z.array(z.enum(["candidate", "verified", "rejected", "superseded"])).optional(),
    timeRange: z
      .object({
        validFrom: z.string().datetime().optional(),
        validTo: z.string().datetime().optional(),
      })
      .optional(),
  })
  .optional();

export const QueryBudgetsSchema = z
  .object({
    vectorResults: z.number().int().positive().optional(),
    graphResults: z.number().int().positive().optional(),
    fusionRatio: z.number().min(0).max(1).optional(),
  })
  .optional();

export const QueryRequestSchema = z.object({
  question: z.string().min(1).max(10000),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  strategy: QueryStrategySchema.default("hybrid"),
  filters: QueryFiltersSchema,
  maxResults: z.number().int().positive().max(100).optional(),
  maxHops: z.number().int().positive().max(10).optional(),
  budgets: QueryBudgetsSchema,
});

export type QueryRequest = z.infer<typeof QueryRequestSchema>;

export const CitationSchema = z.object({
  evidenceId: z.string(),
  snippet: z.string(),
});

export const ClaimSchema = z.object({
  claimId: z.string(),
  claimText: z.string(),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
});

export const FusionTraceEntrySchema = z.object({
  strategy: z.string(),
  inputs: z.number().int().nonnegative(),
  fused: z.number().int().nonnegative(),
  weight: z.number(),
});

export const TimingMsSchema = z.object({
  entityResolution: z.number().int().nonnegative(),
  retrieval: z.number().int().nonnegative(),
  generation: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const QueryResponseSchema = z.object({
  queryId: z.string(),
  answer: z.string(),
  status: z.enum(["answered", "insufficient_evidence", "refused", "clarification_needed"]),
  claims: z.array(ClaimSchema),
  strategiesUsed: z.array(QueryStrategySchema),
  fusionTrace: z.array(FusionTraceEntrySchema),
  timingMs: TimingMsSchema,
  traceId: z.string().optional(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;

export const QueryErrorSchema = z.object({
  statusCode: z.number(),
  error: z.string(),
  message: z.string(),
});

export type QueryError = z.infer<typeof QueryErrorSchema>;
