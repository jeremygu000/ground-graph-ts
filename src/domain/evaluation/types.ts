import { z } from "zod";

export const EvaluationStatusSchema = z.enum(["pending", "running", "passed", "failed", "error"]);

export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;

export const EvaluationMetricSchema = z.object({
  name: z.string(),
  value: z.number(),
  threshold: z.number().optional(),
  passed: z.boolean(),
});

export type EvaluationMetric = z.infer<typeof EvaluationMetricSchema>;

export const EvaluationCaseSchema = z.object({
  id: z.string().uuid(),
  datasetId: z.string().uuid(),
  question: z.string(),
  questionType: z.string(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid().optional(),
  expectedEntities: z.array(z.string()).optional(),
  expectedFacts: z.array(z.string().uuid()).optional(),
  expectedPaths: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        predicate: z.string(),
        objectId: z.string().uuid(),
      }),
    )
    .optional(),
  requiredClaims: z.array(z.string()).optional(),
  forbiddenClaims: z.array(z.string()).optional(),
  answerability: z.enum(["answerable", "unanswerable", "conditional"]),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;

export const EvaluationResultSchema = z.object({
  id: z.string().uuid(),
  caseId: z.string().uuid(),
  runId: z.string().uuid(),
  status: EvaluationStatusSchema,
  metrics: z.array(EvaluationMetricSchema),
  response: z
    .object({
      answer: z.string(),
      citations: z.array(
        z.object({
          evidenceId: z.string().uuid(),
          snippet: z.string(),
        }),
      ),
      status: z.string(),
    })
    .optional(),
  latencyMs: z.number().int().nonnegative(),
  costUSD: z.number().min(0).optional(),
  evaluatedAt: z.string().datetime(),
  versionBundle: z.object({
    codeCommit: z.string().optional(),
    workflowVersion: z.string(),
    promptBundleVersion: z.string().optional(),
    ontologyVersion: z.string().optional(),
    documentIndexVersion: z.string().optional(),
    embeddingModelVersion: z.string().optional(),
    rerankerVersion: z.string().optional(),
    generationModelVersion: z.string().optional(),
    evaluationDatasetVersion: z.string().optional(),
    judgeVersion: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const EvaluationDatasetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  cases: z.array(EvaluationCaseSchema),
  createdAt: z.string().datetime(),
  createdBy: z.string().optional(),
});

export type EvaluationDataset = z.infer<typeof EvaluationDatasetSchema>;
