import type { ImprovementPort } from "./improvement.types";
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
} from "./improvement.types";
import { ImprovementError, type ImprovementErrorCode } from "./improvement.error";
import type {
  Proposal,
  DriftReport,
  FailureCluster,
  ImprovementMetrics,
} from "../../domain/improvement/improvement.schema";
import type { Result } from "../../domain/result";

function err(
  code: ImprovementErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): Result<never> {
  return {
    ok: false,
    error: new ImprovementError({ code, message, metadata: metadata ?? {} }),
  } as Result<never>;
}

export class CreateProposalUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: CreateProposalInput): Promise<Result<Proposal>> {
    if (!input.title || input.title.length < 10) {
      return err("VALIDATION_ERROR", "Proposal title must be at least 10 characters");
    }
    if (!input.description || input.description.length < 20) {
      return err("VALIDATION_ERROR", "Proposal description must be at least 20 characters");
    }
    if (input.evidence.length === 0) {
      return err("VALIDATION_ERROR", "Proposal must have at least one evidence link");
    }
    if (!input.change.proposedValue) {
      return err("VALIDATION_ERROR", "Proposed change must specify a proposed value");
    }
    if (!input.change.rollbackValue) {
      return err("VALIDATION_ERROR", "Proposed change must specify a rollback value");
    }

    const proposal = await this.port.createProposal(input);
    return { ok: true, value: proposal };
  }
}

export class ApproveProposalUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: ApproveProposalInput): Promise<Result<Proposal>> {
    const proposal = await this.port.getProposal(input.proposalId);
    if (!proposal) {
      return err("PROPOSAL_NOT_FOUND", `Proposal ${input.proposalId} not found`);
    }
    if (proposal.status === "approved") {
      return err("PROPOSAL_ALREADY_APPROVED", "Proposal has already been approved");
    }
    if (proposal.status === "rejected") {
      return err("PROPOSAL_ALREADY_REJECTED", "Cannot approve a rejected proposal");
    }
    if (proposal.status !== "pending_approval") {
      return err(
        "INVALID_STATE",
        `Proposal must be pending approval, currently ${proposal.status}`,
      );
    }

    const approved = await this.port.approveProposal(input);
    return { ok: true, value: approved };
  }
}

export class RejectProposalUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: RejectProposalInput): Promise<Result<Proposal>> {
    const proposal = await this.port.getProposal(input.proposalId);
    if (!proposal) {
      return err("PROPOSAL_NOT_FOUND", `Proposal ${input.proposalId} not found`);
    }
    if (proposal.status === "approved") {
      return err("PROPOSAL_ALREADY_APPROVED", "Cannot reject an approved proposal");
    }
    if (proposal.status === "rejected") {
      return err("PROPOSAL_ALREADY_REJECTED", "Proposal has already been rejected");
    }

    const rejected = await this.port.rejectProposal(input);
    return { ok: true, value: rejected };
  }
}

const ROLLOUT_ORDER = ["local", "evaluation", "shadow", "canary", "production"] as const;

export class AdvanceRolloutUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: AdvanceRolloutInput): Promise<Result<Proposal>> {
    const proposal = await this.port.getProposal(input.proposalId);
    if (!proposal) {
      return err("PROPOSAL_NOT_FOUND", `Proposal ${input.proposalId} not found`);
    }
    if (proposal.status !== "approved" && proposal.status !== "in_progress") {
      return err("PROPOSAL_NOT_APPROVED", "Proposal must be approved before rollout");
    }

    const currentStage = proposal.rolloutStage;
    const nextStageIndex = currentStage ? ROLLOUT_ORDER.indexOf(currentStage) + 1 : 0;

    if (nextStageIndex >= ROLLOUT_ORDER.length) {
      return err("INVALID_STATE", "Proposal is already at final stage");
    }

    const expectedNextStage = ROLLOUT_ORDER[nextStageIndex];
    if (input.stage !== expectedNextStage) {
      return err(
        "INVALID_ROLLOUT_TRANSITION",
        `Invalid rollout transition: expected ${expectedNextStage}, got ${input.stage}`,
      );
    }

    const advanced = await this.port.advanceRollout(input);
    return { ok: true, value: advanced };
  }
}

export class RollbackProposalUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: RollbackProposalInput): Promise<Result<Proposal>> {
    const proposal = await this.port.getProposal(input.proposalId);
    if (!proposal) {
      return err("PROPOSAL_NOT_FOUND", `Proposal ${input.proposalId} not found`);
    }
    if (proposal.status === "rolled_back") {
      return err("INVALID_STATE", "Proposal has already been rolled back");
    }
    if (proposal.status !== "approved" && proposal.status !== "in_progress") {
      return err("INVALID_STATE", "Proposal cannot be rolled back in its current state");
    }

    const rolledBack = await this.port.rollbackProposal(input);
    return { ok: true, value: rolledBack };
  }
}

export class GetProposalUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(proposalId: string): Promise<Result<Proposal>> {
    const proposal = await this.port.getProposal(proposalId);
    if (!proposal) {
      return err("PROPOSAL_NOT_FOUND", `Proposal ${proposalId} not found`);
    }
    return { ok: true, value: proposal };
  }
}

export class ListProposalsUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(filters: ProposalFilters): Promise<Result<Proposal[]>> {
    const proposals = await this.port.listProposals(filters);
    return { ok: true, value: proposals };
  }
}

export class CreateDriftReportUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: CreateDriftReportInput): Promise<Result<DriftReport>> {
    if (!input.description || input.description.length < 20) {
      return err("VALIDATION_ERROR", "Drift report description must be at least 20 characters");
    }

    const report = await this.port.createDriftReport(input);
    return { ok: true, value: report };
  }
}

export class ListDriftReportsUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(filters: DriftFilters): Promise<Result<DriftReport[]>> {
    const reports = await this.port.listDriftReports(filters);
    return { ok: true, value: reports };
  }
}

export class ReviewDriftReportUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(
    reportId: string,
    reviewedBy: string,
    status: DriftReport["reviewStatus"],
  ): Promise<Result<DriftReport>> {
    const report = await this.port.getDriftReport(reportId);
    if (!report) {
      return err("DRIFT_REPORT_NOT_FOUND", `Drift report ${reportId} not found`);
    }

    const reviewed = await this.port.reviewDriftReport(reportId, reviewedBy, status);
    return { ok: true, value: reviewed };
  }
}

export class ClusterFailuresUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(input: FailureClusteringInput): Promise<Result<FailureCluster[]>> {
    if (input.minOccurrences < 2) {
      return err("VALIDATION_ERROR", "minOccurrences must be at least 2");
    }
    if (input.timeWindowMinutes < 5) {
      return err("VALIDATION_ERROR", "timeWindowMinutes must be at least 5");
    }

    const clusters = await this.port.clusterFailures(input);
    return { ok: true, value: clusters };
  }
}

export class GetImprovementMetricsUseCase {
  constructor(private readonly port: ImprovementPort) {}

  async execute(tenantId: string): Promise<Result<ImprovementMetrics>> {
    const metrics = await this.port.getMetrics(tenantId);
    return { ok: true, value: metrics };
  }
}
