import type { ImprovementPort } from "../../application/improvement/improvement.types";
import type {
  CreateProposalInput,
  ApproveProposalInput,
  RejectProposalInput,
  AdvanceRolloutInput,
  RollbackProposalInput,
  CreateDriftReportInput,
  FailureClusteringInput,
  ProposalFilters,
  DriftFilters,
} from "../../application/improvement/improvement.types";
import type {
  Proposal,
  DriftReport,
  FailureCluster,
  ImprovementMetrics,
} from "../../domain/improvement/improvement.schema";
import {
  ProposalSchema,
  DriftReportSchema,
  FailureClusterSchema,
} from "../../domain/improvement/improvement.schema";
import { validateOrThrow } from "../../domain/validation";

export class InMemoryImprovementAdapter implements ImprovementPort {
  private readonly proposals: Map<string, Proposal> = new Map();
  private readonly driftReports: Map<string, DriftReport> = new Map();
  private readonly clusters: Map<string, FailureCluster> = new Map();
  private readonly rolloutRecords: Map<string, string> = new Map();

  async createProposal(input: CreateProposalInput): Promise<Proposal> {
    const now = new Date().toISOString();
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      type: input.type,
      status: "draft",
      change: input.change,
      evidence: input.evidence,
      clusterId: input.clusterId,
      createdAt: now,
      createdBy: "system",
      rolloutStage: undefined,
    };
    validateOrThrow(ProposalSchema, proposal);
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  async getProposal(proposalId: string): Promise<Proposal | null> {
    return this.proposals.get(proposalId) ?? null;
  }

  async listProposals(filters: ProposalFilters): Promise<Proposal[]> {
    let results = Array.from(this.proposals.values()).filter(
      (p) => p.tenantId === filters.tenantId,
    );
    if (filters.status) {
      results = results.filter((p) => p.status === filters.status);
    }
    if (filters.type) {
      results = results.filter((p) => p.type === filters.type);
    }
    if (filters.rolloutStage) {
      results = results.filter((p) => p.rolloutStage === filters.rolloutStage);
    }
    if (filters.clusterId) {
      results = results.filter((p) => p.clusterId === filters.clusterId);
    }
    return results;
  }

  async approveProposal(input: ApproveProposalInput): Promise<Proposal> {
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${input.proposalId} not found`);
    }
    const updated: Proposal = {
      ...proposal,
      status: "approved",
      approvedAt: new Date().toISOString(),
      approvedBy: input.approvedBy,
    };
    validateOrThrow(ProposalSchema, updated);
    this.proposals.set(proposal.id, updated);
    return updated;
  }

  async rejectProposal(input: RejectProposalInput): Promise<Proposal> {
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${input.proposalId} not found`);
    }
    const updated: Proposal = {
      ...proposal,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectedBy: input.rejectedBy,
      rejectionReason: input.reason,
    };
    validateOrThrow(ProposalSchema, updated);
    this.proposals.set(proposal.id, updated);
    return updated;
  }

  async advanceRollout(input: AdvanceRolloutInput): Promise<Proposal> {
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${input.proposalId} not found`);
    }
    const updated: Proposal = {
      ...proposal,
      status: input.stage === "production" ? "completed" : "in_progress",
      rolloutStage: input.stage,
    };
    validateOrThrow(ProposalSchema, updated);
    this.proposals.set(proposal.id, updated);
    this.rolloutRecords.set(
      `${proposal.id}-${input.stage}`,
      JSON.stringify({
        id: crypto.randomUUID(),
        proposalId: proposal.id,
        stage: input.stage,
        status: "started",
        startedAt: new Date().toISOString(),
        notes: input.notes,
      }),
    );
    return updated;
  }

  async rollbackProposal(input: RollbackProposalInput): Promise<Proposal> {
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${input.proposalId} not found`);
    }
    const updated: Proposal = {
      ...proposal,
      status: "rolled_back",
      rolloutStage: undefined,
    };
    validateOrThrow(ProposalSchema, updated);
    this.proposals.set(proposal.id, updated);
    return updated;
  }

  async createDriftReport(input: CreateDriftReportInput): Promise<DriftReport> {
    const report: DriftReport = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      type: input.type,
      severity: input.severity,
      detectedAt: new Date().toISOString(),
      description: input.description,
      expectedValue: input.expectedValue,
      actualValue: input.actualValue,
      reviewStatus: "pending",
    };
    validateOrThrow(DriftReportSchema, report);
    this.driftReports.set(report.id, report);
    return report;
  }

  async getDriftReport(reportId: string): Promise<DriftReport | null> {
    return this.driftReports.get(reportId) ?? null;
  }

  async listDriftReports(filters: DriftFilters): Promise<DriftReport[]> {
    let results = Array.from(this.driftReports.values()).filter(
      (r) => r.tenantId === filters.tenantId,
    );
    if (filters.reviewStatus) {
      results = results.filter((r) => r.reviewStatus === filters.reviewStatus);
    }
    if (filters.severity) {
      results = results.filter((r) => r.severity === filters.severity);
    }
    if (filters.type) {
      results = results.filter((r) => r.type === filters.type);
    }
    return results;
  }

  async reviewDriftReport(
    reportId: string,
    reviewedBy: string,
    status: DriftReport["reviewStatus"],
  ): Promise<DriftReport> {
    const report = this.driftReports.get(reportId);
    if (!report) {
      throw new Error(`Drift report ${reportId} not found`);
    }
    const updated: DriftReport = {
      ...report,
      reviewStatus: status,
      reviewedAt: new Date().toISOString(),
      reviewedBy,
    };
    validateOrThrow(DriftReportSchema, updated);
    this.driftReports.set(reportId, updated);
    return updated;
  }

  async clusterFailures(input: FailureClusteringInput): Promise<FailureCluster[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - input.timeWindowMinutes * 60 * 1000);

    const recentClusters = Array.from(this.clusters.values()).filter(
      (c) => c.tenantId === input.tenantId && new Date(c.lastSeenAt) >= cutoff,
    );

    if (recentClusters.length >= input.minOccurrences) {
      return recentClusters;
    }

    const cluster: FailureCluster = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      failurePattern: "Elevated error rate in retrieval",
      occurrenceCount: input.minOccurrences,
      affectedTraceIds: [],
      firstSeenAt: cutoff.toISOString(),
      lastSeenAt: now.toISOString(),
    };
    validateOrThrow(FailureClusterSchema, cluster);
    this.clusters.set(cluster.id, cluster);
    return [cluster];
  }

  async getMetrics(tenantId: string): Promise<ImprovementMetrics> {
    const proposals = await this.listProposals({ tenantId });

    const pending = proposals.filter((p) => p.status === "pending_approval").length;
    const inRollout = proposals.filter(
      (p) => p.status === "approved" || p.status === "in_progress",
    ).length;
    const completed = proposals.filter((p) => p.status === "completed").length;
    const rolledBack = proposals.filter((p) => p.status === "rolled_back").length;

    return {
      totalProposals: proposals.length,
      pendingApproval: pending,
      inRollout,
      completed,
      rolledBack,
    };
  }
}
