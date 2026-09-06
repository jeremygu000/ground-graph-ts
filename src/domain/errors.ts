import type { AppErrorOptions, ErrorCode } from "./errors.types";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public override readonly cause: unknown;
  public readonly metadata: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.cause = options.cause;
    this.metadata = options.metadata ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
      metadata: this.metadata,
    };
  }
}

export class InternalError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: "INTERNAL_ERROR", message, cause });
    this.name = "InternalError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      code: "NOT_FOUND",
      message: id ? `${resource} with id '${id}' not found` : `${resource} not found`,
    });
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    const opts: AppErrorOptions = { code: "VALIDATION_ERROR", message };
    if (metadata !== undefined) {
      opts.metadata = metadata;
    }
    super(opts);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super({ code: "UNAUTHORIZED", message });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", message });
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super({ code: "CONFLICT", message });
    this.name = "ConflictError";
  }
}

export class AlreadyExistsError extends AppError {
  constructor(resource: string, id?: string) {
    super({
      code: "ALREADY_EXISTS",
      message: id ? `${resource} with id '${id}' already exists` : `${resource} already exists`,
    });
    this.name = "AlreadyExistsError";
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string) {
    super({ code: "INVALID_STATE", message });
    this.name = "InvalidStateError";
  }
}

export class TimeoutError extends AppError {
  constructor(message = "Operation timed out") {
    super({ code: "TIMEOUT", message });
    this.name = "TimeoutError";
  }
}

export class NetworkError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: "NETWORK_ERROR", message, cause });
    this.name = "NetworkError";
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: "DATABASE_ERROR", message, cause });
    this.name = "DatabaseError";
  }
}

export class GraphError extends AppError {
  constructor(message: string, cause?: unknown) {
    super({ code: "GRAPH_ERROR", message, cause });
    this.name = "GraphError";
  }
}
