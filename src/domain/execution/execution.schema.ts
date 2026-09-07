import { z } from "zod";

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const StepStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export type StepStatus = z.infer<typeof StepStatusSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  stepName: z.string(),
  stepType: z.string(),
  status: StepStatusSchema,
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionRunSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  workflowName: z.string(),
  workflowVersion: z.string(),
  status: RunStatusSchema,
  triggerType: z.enum(["manual", "scheduled", "webhook", "ingestion", "evaluation", "replay"]),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  versionBundle: z.object({
    codeCommit: z.string().optional(),
    workflowVersion: z.string(),
    promptBundleVersion: z.string().optional(),
    ontologyVersion: z.string().optional(),
    documentIndexVersion: z.string().optional(),
    embeddingModelVersion: z.string().optional(),
    rerankerVersion: z.string().optional(),
    generationModelVersion: z.string().optional(),
  }),
});

export type ExecutionRun = z.infer<typeof ExecutionRunSchema>;

export const ExecutionStepDependencySchema = z.object({
  stepId: z.string().uuid(),
  dependsOnStepId: z.string().uuid(),
});

export type ExecutionStepDependency = z.infer<typeof ExecutionStepDependencySchema>;
