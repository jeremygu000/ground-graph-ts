import type { ExecutionRun, ExecutionStep } from "../../domain/execution/types";
import type { Result } from "../../domain/result";
import type { OutboxEvent, OutboxRepository } from "../events/ports";

export type { OutboxEvent, OutboxRepository };

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
  addDependency(stepId: string, dependsOnStepId: string, tenantId: string): Promise<Result<void>>;
  getDependencies(stepId: string, tenantId: string): Promise<Result<ExecutionStep[]>>;
}
