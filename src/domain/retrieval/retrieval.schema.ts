import { z } from "zod";

export const RetrievalStrategySchema = z.enum(["vector", "graph", "hybrid", "fulltext"]);

export type RetrievalStrategy = z.infer<typeof RetrievalStrategySchema>;

export const RetrievalQuerySchema = z.object({
  question: z.string().min(1),
  tenantId: z.uuid(),
  principalId: z.uuid(),
  strategy: RetrievalStrategySchema,
  filters: z
    .object({
      documentIds: z.array(z.uuid()).optional(),
      entityTypes: z.array(z.string()).optional(),
      factStatuses: z.array(z.enum(["candidate", "verified", "rejected", "superseded"])).optional(),
      timeRange: z
        .object({
          validFrom: z.iso.datetime().optional(),
          validTo: z.iso.datetime().optional(),
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
  id: z.uuid(),
  strategy: RetrievalStrategySchema,
  score: z.number().min(0).max(1),
  chunkId: z.uuid().optional(),
  entityId: z.uuid().optional(),
  factId: z.uuid().optional(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RetrievalResult = z.infer<typeof RetrievalResultSchema>;

export const RetrievalResponseSchema = z.object({
  queryId: z.uuid(),
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
      claimId: z.uuid(),
      claimText: z.string(),
      citations: z.array(
        z.object({
          evidenceId: z.uuid(),
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
