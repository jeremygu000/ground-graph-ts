import type { Result } from "../../domain/result";

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

export interface OutboxRepository {
  create(event: OutboxEvent): Promise<Result<OutboxEvent>>;
  findPending(tenantId: string, limit: number): Promise<Result<OutboxEvent[]>>;
  claim(
    ids: string[],
    workerId: string,
    leaseDurationMs: number,
    tenantId: string,
  ): Promise<Result<OutboxEvent[]>>;
  complete(id: string, token: string, tenantId: string): Promise<Result<void>>;
  fail(
    id: string,
    token: string,
    error: string,
    tenantId: string,
    maxAttempts?: number,
  ): Promise<Result<void>>;
  deadLetter(id: string, token: string, error: string, tenantId: string): Promise<Result<void>>;
  findById(id: string, tenantId: string): Promise<Result<OutboxEvent | null>>;
}

export interface OutboxEventRepository {
  create(event: Omit<OutboxEvent, "id" | "createdAt" | "updatedAt">): Promise<Result<OutboxEvent>>;
  findById(id: string, tenantId: string): Promise<Result<OutboxEvent | null>>;
  findPending(tenantId: string, limit: number, asOf: string): Promise<Result<OutboxEvent[]>>;
  findDeadLetter(tenantId: string, limit: number): Promise<Result<OutboxEvent[]>>;
  findByAggregateId(aggregateId: string, tenantId: string): Promise<Result<OutboxEvent[]>>;
}

export interface OutboxEventPublisher {
  publish(
    event: Omit<
      OutboxEvent,
      "id" | "status" | "attempts" | "availableAt" | "createdAt" | "updatedAt"
    >,
  ): Promise<Result<OutboxEvent>>;
}

export interface OutboxWorker {
  processBatch(
    workerId: string,
    batchSize: number,
    leaseDurationMs: number,
  ): Promise<ProcessedBatch>;
}

export interface ProcessedBatch {
  processed: number;
  failed: number;
  deadLettered: number;
  errors: Array<{ eventId: string; error: string }>;
}
