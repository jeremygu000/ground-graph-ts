import { z } from "zod";

const ProposalTypeSchema = z.enum([
  "prompt_tuning",
  "threshold_adjustment",
  "routing_change",
  "chunking_strategy",
  "ontology_update",
  "code_change",
]);

const RolloutStageSchema = z.enum(["local", "evaluation", "shadow", "canary", "production"]);

const ProposalStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "in_progress",
  "completed",
  "rolled_back",
  "cancelled",
]);

const DriftSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

const DriftTypeSchema = z.enum(["config_drift", "model_drift", "schema_drift", "policy_drift"]);

export const CreateProposalRequestSchema = z.object({
  title: z.string().min(10),
  description: z.string().min(20),
  type: ProposalTypeSchema,
  change: z.object({
    targetType: ProposalTypeSchema,
    targetPath: z.string(),
    currentValue: z.unknown(),
    proposedValue: z.unknown(),
    rollbackValue: z.unknown(),
    justification: z.string(),
  }),
  evidence: z
    .array(
      z.object({
        type: z.enum(["trace_id", "eval_result_id", "run_id", "eval_case_id"]),
        id: z.string(),
        relevanceScore: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1),
  clusterId: z.string().uuid().optional(),
});

export type CreateProposalRequest = z.infer<typeof CreateProposalRequestSchema>;

export const ProposalResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  type: ProposalTypeSchema,
  status: ProposalStatusSchema,
  change: z.object({
    targetType: ProposalTypeSchema,
    targetPath: z.string(),
    currentValue: z.unknown(),
    proposedValue: z.unknown(),
    rollbackValue: z.unknown(),
    justification: z.string(),
  }),
  evidence: z.array(
    z.object({
      type: z.enum(["trace_id", "eval_result_id", "run_id", "eval_case_id"]),
      id: z.string(),
      relevanceScore: z.number().min(0).max(1).optional(),
    }),
  ),
  clusterId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  approvedAt: z.string().datetime().optional(),
  approvedBy: z.string().optional(),
  rejectedAt: z.string().datetime().optional(),
  rejectedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  rolloutStage: RolloutStageSchema.optional(),
});

export type ProposalResponse = z.infer<typeof ProposalResponseSchema>;

export const ListProposalsRequestSchema = z.object({
  tenantId: z.string().uuid(),
  status: ProposalStatusSchema.optional(),
  type: ProposalTypeSchema.optional(),
  rolloutStage: RolloutStageSchema.optional(),
  clusterId: z.string().uuid().optional(),
});

export type ListProposalsRequest = z.infer<typeof ListProposalsRequestSchema>;

export const ListProposalsResponseSchema = z.object({
  proposals: z.array(ProposalResponseSchema),
  total: z.number().int().nonnegative(),
});

export type ListProposalsResponse = z.infer<typeof ListProposalsResponseSchema>;

export const ApproveProposalRequestSchema = z.object({
  proposalId: z.string().uuid(),
});

export const RejectProposalRequestSchema = z.object({
  proposalId: z.string().uuid(),
  reason: z.string().min(10),
});

export const AdvanceRolloutRequestSchema = z.object({
  proposalId: z.string().uuid(),
  stage: RolloutStageSchema,
  notes: z.string().optional(),
});

export const RollbackProposalRequestSchema = z.object({
  proposalId: z.string().uuid(),
  reason: z.string().min(10),
});

export const CreateDriftReportRequestSchema = z.object({
  type: DriftTypeSchema,
  severity: DriftSeveritySchema,
  description: z.string().min(20),
  expectedValue: z.unknown(),
  actualValue: z.unknown(),
});

export type CreateDriftReportRequest = z.infer<typeof CreateDriftReportRequestSchema>;

export const DriftReportResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: DriftTypeSchema,
  severity: DriftSeveritySchema,
  detectedAt: z.string().datetime(),
  description: z.string(),
  expectedValue: z.unknown(),
  actualValue: z.unknown(),
  reviewStatus: z.enum(["pending", "in_review", "resolved", "accepted_risk"]),
  reviewedAt: z.string().datetime().optional(),
  reviewedBy: z.string().optional(),
});

export type DriftReportResponse = z.infer<typeof DriftReportResponseSchema>;

export const ReviewDriftReportRequestSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(["pending", "in_review", "resolved", "accepted_risk"]),
});

export const ListDriftReportsRequestSchema = z.object({
  tenantId: z.string().uuid(),
  reviewStatus: z.enum(["pending", "in_review", "resolved", "accepted_risk"]).optional(),
  severity: DriftSeveritySchema.optional(),
  type: DriftTypeSchema.optional(),
});

export type ListDriftReportsRequest = z.infer<typeof ListDriftReportsRequestSchema>;

export const ListDriftReportsResponseSchema = z.object({
  reports: z.array(DriftReportResponseSchema),
  total: z.number().int().nonnegative(),
});

export type ListDrriftReportsResponse = z.infer<typeof ListDriftReportsResponseSchema>;

export const ImprovementMetricsResponseSchema = z.object({
  totalProposals: z.number().int().nonnegative(),
  pendingApproval: z.number().int().nonnegative(),
  inRollout: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  rolledBack: z.number().int().nonnegative(),
  avgTimeToApproval: z.number().optional(),
  avgTimeToProduction: z.number().optional(),
});

export type ImprovementMetricsResponse = z.infer<typeof ImprovementMetricsResponseSchema>;

export type {
  ProposalTypeSchema,
  ProposalStatusSchema,
  RolloutStageSchema,
  DriftSeveritySchema,
  DriftTypeSchema,
};
