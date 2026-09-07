import type { ErrorCode } from "../../domain/errors.types";

export type ImprovementErrorCode =
  | ErrorCode
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_NOT_APPROVED"
  | "PROPOSAL_ALREADY_APPROVED"
  | "PROPOSAL_ALREADY_REJECTED"
  | "INVALID_STATE"
  | "INVALID_ROLLOUT_TRANSITION"
  | "DRIFT_REPORT_NOT_FOUND"
  | "CLUSTER_NOT_FOUND"
  | "AUTHORIZATION_REQUIRED"
  | "HUMAN_APPROVAL_REQUIRED"
  | "PROPOSAL_NOT_DRAFT";

export interface ImprovementErrorOptions {
  code: ImprovementErrorCode;
  message: string;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export class ImprovementError extends Error {
  readonly code: ImprovementErrorCode;
  override readonly cause: unknown;
  readonly metadata: Record<string, unknown>;

  constructor(options: ImprovementErrorOptions) {
    super(options.message);
    this.name = "ImprovementError";
    this.code = options.code;
    this.cause = options.cause ?? undefined;
    this.metadata = options.metadata ?? {};
  }
}

export function isImprovementError(err: unknown): err is ImprovementError {
  return err instanceof ImprovementError;
}
