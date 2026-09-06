export type ErrorCode =
  | "INTERNAL_ERROR"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "ALREADY_EXISTS"
  | "INVALID_STATE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "DATABASE_ERROR"
  | "GRAPH_ERROR";

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}
