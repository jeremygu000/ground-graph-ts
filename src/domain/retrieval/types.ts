import { z } from "zod";

export const RetrievalStrategySchema = z.enum(["vector", "graph", "hybrid", "fulltext"]);

export type RetrievalStrategy = z.infer<typeof RetrievalStrategySchema>;

export const RetrievalQuerySchema = z.object({
  question: z.string().min(1),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  strategy: RetrievalStrategySchema,
  filters: z
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
    .optional(),
  maxResults: z.number().int().positive().default(20),
  maxHops: z.number().int().min(1).max(5).optional(),
  budgets: z
    .object({
      vectorResults: z.number().int().positive().optional(),
      graphResults: z.number().int().positive().optional(),
      fusionRatio: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export type RetrievalQuery = z.infer<typeof RetrievalQuerySchema>;

export const RetrievalResultSchema = z.object({
  id: z.string().uuid(),
  strategy: RetrievalStrategySchema,
  score: z.number().min(0).max(1),
  chunkId: z.string().uuid().optional(),
  entityId: z.string().uuid().optional(),
  factId: z.string().uuid().optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

export const RetrievalResponseSchema = z.object({
  queryId: z.string().uuid(),
  results: z.array(RetrievalResultSchema),
  totalResults: z.number().int().nonnegative(),
  retrievalTimeMs: z.number().int().nonnegative(),
  strategiesUsed: z.array(RetrievalStrategySchema),
});

export type RetrievalResponse = z.infer<typeof RetrievalResponseSchema>;

export const QueryResponseSchema = z.object({
  answer: z.string(),
  claims: z.array(
    z.object({
      claimId: z.string().uuid(),
      claimText: z.string(),
      citations: z.array(
        z.object({
          evidenceId: z.string().uuid(),
          snippet: z.string(),
        }),
      ),
      confidence: z.number().min(0).max(1),
    }),
  ),
  status: z.enum(["answered", "clarification_needed", "insufficient_evidence", "refused"]),
  traceId: z.string().optional(),
});

export type QueryResponse = z.infer<typeof QueryResponseSchema>;
