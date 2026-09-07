import type {
  Proposal,
  ProposalStatus,
  RolloutStage,
  FailureCluster,
  DriftReport,
  EvidenceLink,
  ProposedChange,
  ImprovementMetrics,
} from "../../domain/improvement/improvement.schema";

export interface CreateProposalInput {
  tenantId: string;
  title: string;
  description: string;
  type: Proposal["type"];
  change: ProposedChange;
  evidence: EvidenceLink[];
  clusterId?: string;
}

export interface ApproveProposalInput {
  proposalId: string;
  approvedBy: string;
}

export interface RejectProposalInput {
  proposalId: string;
  rejectedBy: string;
  reason: string;
}

export interface AdvanceRolloutInput {
  proposalId: string;
  stage: RolloutStage;
  notes?: string;
}

export interface RollbackProposalInput {
  proposalId: string;
  rolledBackBy: string;
  reason: string;
}

export interface CreateDriftReportInput {
  tenantId: string;
  type: DriftReport["type"];
  severity: DriftReport["severity"];
  description: string;
  expectedValue: unknown;
  actualValue: unknown;
}

export interface FailureClusteringInput {
  tenantId: string;
  timeWindowMinutes: number;
  minOccurrences: number;
}

export interface ProposalFilters {
  tenantId: string;
  status?: ProposalStatus;
  type?: Proposal["type"];
  rolloutStage?: RolloutStage;
  clusterId?: string;
}

export interface DriftFilters {
  tenantId: string;
  reviewStatus?: DriftReport["reviewStatus"];
  severity?: DriftReport["severity"];
  type?: DriftReport["type"];
}

export interface ImprovementPort {
  createProposal(input: CreateProposalInput): Promise<Proposal>;

  getProposal(proposalId: string): Promise<Proposal | null>;

  listProposals(filters: ProposalFilters): Promise<Proposal[]>;

  approveProposal(input: ApproveProposalInput): Promise<Proposal>;

  rejectProposal(input: RejectProposalInput): Promise<Proposal>;

  advanceRollout(input: AdvanceRolloutInput): Promise<Proposal>;

  rollbackProposal(input: RollbackProposalInput): Promise<Proposal>;

  createDriftReport(input: CreateDriftReportInput): Promise<DriftReport>;

  getDriftReport(reportId: string): Promise<DriftReport | null>;

  listDriftReports(filters: DriftFilters): Promise<DriftReport[]>;

  reviewDriftReport(
    reportId: string,
    reviewedBy: string,
    status: DriftReport["reviewStatus"],
  ): Promise<DriftReport>;

  clusterFailures(input: FailureClusteringInput): Promise<FailureCluster[]>;

  getMetrics(tenantId: string): Promise<ImprovementMetrics>;
}
