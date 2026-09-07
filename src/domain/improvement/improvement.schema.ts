import { z } from "zod";

export const ProposalTypeSchema = z.enum([
  "prompt_tuning",
  "threshold_adjustment",
  "routing_change",
  "chunking_strategy",
  "ontology_update",
  "code_change",
]);

export type ProposalType = z.infer<typeof ProposalTypeSchema>;

export const RolloutStageSchema = z.enum(["local", "evaluation", "shadow", "canary", "production"]);

export type RolloutStage = z.infer<typeof RolloutStageSchema>;

export const ProposalStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "in_progress",
  "completed",
  "rolled_back",
  "cancelled",
]);

export type ProposalStatus = z.infer<typeof ProposalStatusSchema>;

export const FailureClusterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  failurePattern: z.string(),
  occurrenceCount: z.number().int().nonnegative(),
  affectedTraceIds: z.array(z.string()),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  rootCauseHypothesis: z.string().optional(),
});

export type FailureCluster = z.infer<typeof FailureClusterSchema>;

export const EvidenceLinkSchema = z.object({
  type: z.enum(["trace_id", "eval_result_id", "run_id", "eval_case_id"]),
  id: z.string(),
  relevanceScore: z.number().min(0).max(1).optional(),
});

export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

export const ProposedChangeSchema = z.object({
  targetType: ProposalTypeSchema,
  targetPath: z.string(),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
  rollbackValue: z.unknown(),
  justification: z.string(),
});

export type ProposedChange = z.infer<typeof ProposedChangeSchema>;

export const ProposalSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  type: ProposalTypeSchema,
  status: ProposalStatusSchema,
  change: ProposedChangeSchema,
  evidence: z.array(EvidenceLinkSchema),
  clusterId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  submittedAt: z.string().datetime().optional(),
  submittedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().optional(),
  rejectedAt: z.string().datetime().optional(),
  rejectedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  rolloutStage: RolloutStageSchema.optional(),
  versionBundle: z
    .object({
      codeCommit: z.string().optional(),
      workflowVersion: z.string(),
      promptBundleVersion: z.string().optional(),
      ontologyVersion: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type Proposal = z.infer<typeof ProposalSchema>;

export const RolloutRecordSchema = z.object({
  id: z.string().uuid(),
  proposalId: z.string().uuid(),
  stage: RolloutStageSchema,
  status: z.enum(["started", "running", "succeeded", "failed", "rolled_back"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
  metrics: z
    .object({
      latencyMs: z.number().optional(),
      errorRate: z.number().optional(),
      userFeedback: z.number().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

export type RolloutRecord = z.infer<typeof RolloutRecordSchema>;

export const DriftSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export type DriftSeverity = z.infer<typeof DriftSeveritySchema>;

export const DriftTypeSchema = z.enum([
  "config_drift",
  "model_drift",
  "schema_drift",
  "policy_drift",
]);

export type DriftType = z.infer<typeof DriftTypeSchema>;

export const DriftReportSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: DriftTypeSchema,
  severity: DriftSeveritySchema,
  detectedAt: z.string().datetime(),
  description: z.string(),
  expectedValue: z.unknown(),
  actualValue: z.unknown(),
  affectedProposals: z.array(z.string().uuid()).optional(),
  reviewStatus: z.enum(["pending", "in_review", "resolved", "accepted_risk"]).default("pending"),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().optional(),
});

export type DriftReport = z.infer<typeof DriftReportSchema>;

export const ImprovementMetricsSchema = z.object({
  totalProposals: z.number().int().nonnegative(),
  pendingApproval: z.number().int().nonnegative(),
  inRollout: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  rolledBack: z.number().int().nonnegative(),
  avgTimeToApproval: z.number().optional(),
  avgTimeToProduction: z.number().optional(),
});

export type ImprovementMetrics = z.infer<typeof ImprovementMetricsSchema>;
