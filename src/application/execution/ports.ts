import type {
  ExecutionRun,
  ExecutionStep,
  ExecutionStepDependency,
} from "../../domain/execution/types";
import type { Result } from "../../domain/result";

export interface ExecutionRunRepository {
  create(run: ExecutionRun): Promise<Result<ExecutionRun>>;
  findById(id: string, tenantId: string): Promise<Result<ExecutionRun | null>>;
  findByStatus(status: ExecutionRun["status"], tenantId: string): Promise<Result<ExecutionRun[]>>;
  updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionRun["status"],
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<Result<ExecutionRun>>;
  compareAndSetStatus(
    id: string,
    tenantId: string,
    expectedStatus: ExecutionRun["status"],
    newStatus: ExecutionRun["status"],
  ): Promise<Result<ExecutionRun>>;
  list(tenantId: string, limit?: number, offset?: number): Promise<Result<ExecutionRun[]>>;
}

export interface ExecutionStepRepository {
  create(step: ExecutionStep): Promise<Result<ExecutionStep>>;
  findById(id: string, tenantId: string): Promise<Result<ExecutionStep | null>>;
  findByRunId(runId: string, tenantId: string): Promise<Result<ExecutionStep[]>>;
  updateStatus(
    id: string,
    tenantId: string,
    status: ExecutionStep["status"],
    output?: Record<string, unknown>,
    error?: string,
  ): Promise<Result<ExecutionStep>>;
  compareAndSetStatus(
    id: string,
    tenantId: string,
    expectedStatus: ExecutionStep["status"],
    newStatus: ExecutionStep["status"],
  ): Promise<Result<ExecutionStep>>;
  addDependency(dependency: ExecutionStepDependency): Promise<Result<void>>;
  getDependencies(stepId: string, tenantId: string): Promise<Result<ExecutionStep[]>>;
}

export interface OutboxRepository {
  create(event: OutboxEvent): Promise<Result<OutboxEvent>>;
  findPending(tenantId: string, limit: number): Promise<Result<OutboxEvent[]>>;
  claim(ids: string[], workerId: string, leaseDurationMs: number): Promise<Result<OutboxEvent[]>>;
  complete(id: string, token: string): Promise<Result<void>>;
  fail(id: string, token: string, error: string): Promise<Result<void>>;
  deadLetter(id: string, token: string, error: string): Promise<Result<void>>;
  findById(id: string, tenantId: string): Promise<Result<OutboxEvent | null>>;
}

export interface OutboxEvent {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: "pending" | "claimed" | "completed" | "dead_letter";
  attempts: number;
  availableAt: string;
  claimedAt?: string;
  claimedBy?: string;
  leaseToken?: string;
  completedAt?: string;
  deadLetteredAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
