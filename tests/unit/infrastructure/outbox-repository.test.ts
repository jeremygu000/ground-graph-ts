import { describe, expect, it, vi } from "vitest";
import { PostgresOutboxRepository } from "../../../src/infrastructure/postgres/repositories/outbox-repository";

type QueueMap = {
  select?: unknown[];
  insert?: unknown[];
  update?: unknown[];
  execute?: unknown[];
  transaction?: QueueMap[];
};

function createThenable(result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
    for: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function createTxMock(queues: QueueMap = {}) {
  const selectQueue = [...(queues.select ?? [])];
  const insertQueue = [...(queues.insert ?? [])];
  const updateQueue = [...(queues.update ?? [])];
  const executeQueue = [...(queues.execute ?? [])];

  return {
    select: vi.fn(() => createThenable(selectQueue.shift())),
    insert: vi.fn(() => createThenable(insertQueue.shift())),
    update: vi.fn(() => createThenable(updateQueue.shift())),
    execute: vi.fn(() => Promise.resolve(executeQueue.shift())),
  };
}

function createDbMock(queues: QueueMap = {}) {
  const selectQueue = [...(queues.select ?? [])];
  const insertQueue = [...(queues.insert ?? [])];
  const updateQueue = [...(queues.update ?? [])];
  const executeQueue = [...(queues.execute ?? [])];
  const transactionQueue = [...(queues.transaction ?? [])];

  return {
    drizzle: {
      select: vi.fn(() => createThenable(selectQueue.shift())),
      insert: vi.fn(() => createThenable(insertQueue.shift())),
      update: vi.fn(() => createThenable(updateQueue.shift())),
      execute: vi.fn(() => Promise.resolve(executeQueue.shift())),
      transaction: vi.fn(async (fn: (tx: ReturnType<typeof createTxMock>) => Promise<unknown>) =>
        fn(createTxMock(transactionQueue.shift())),
      ),
    },
  };
}

const outboxRow = {
  id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  tenantId: "22222222-2222-4222-8222-222222222222",
  aggregateType: "document",
  aggregateId: "33333333-3333-4333-8333-333333333333",
  eventType: "DocumentCreated",
  payload: { id: "evt" },
  idempotencyKey: "key",
  status: "pending",
  attempts: 0,
  availableAt: "2024-01-01T00:00:00.000Z",
  claimedAt: undefined,
  claimedBy: undefined,
  leaseToken: undefined,
  completedAt: undefined,
  deadLetteredAt: undefined,
  error: undefined,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

describe("PostgresOutboxRepository", () => {
  it("covers create, lookup, claim, completion, failure, and dead-lettering", async () => {
    const db = createDbMock({
      insert: [[outboxRow]],
      select: [[outboxRow], [outboxRow], [{ id: outboxRow.id }], [outboxRow]],
      update: [[{ id: outboxRow.id }], [{ id: outboxRow.id }], [{ id: outboxRow.id }]],
      execute: [[{ id: outboxRow.id }], [{ id: outboxRow.id }]],
      transaction: [
        {
          select: [[{ id: outboxRow.id }]],
          update: [[{ id: outboxRow.id }]],
          execute: [[{ id: outboxRow.id }]],
        },
        {
          select: [[outboxRow]],
          update: [[{ id: outboxRow.id }]],
          execute: [],
        },
      ],
    });
    const repo = new PostgresOutboxRepository(db as never);

    await expect(repo.create(outboxRow as never)).resolves.toMatchObject({ ok: true });
    await expect(repo.findPending(outboxRow.tenantId, 10)).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(outboxRow.id, outboxRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.claim([outboxRow.id], "worker-1", 1_000, outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.complete(outboxRow.id, "token", outboxRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.fail(outboxRow.id, "token", "boom", outboxRow.tenantId, 1),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repo.deadLetter(outboxRow.id, "token", "boom", outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
  });
});
