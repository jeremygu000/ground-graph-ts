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

  it("covers empty-result and error branches", async () => {
    const empty = new PostgresOutboxRepository(
      createDbMock({
        insert: [[]],
        select: [[], []],
        update: [[], []],
        transaction: [{ execute: [[]] }, { select: [[]] }],
      }) as never,
    );
    await expect(empty.create(outboxRow as never)).resolves.toMatchObject({ ok: false });
    await expect(empty.findPending(outboxRow.tenantId, 10)).resolves.toMatchObject({
      ok: true,
      value: [],
    });
    await expect(empty.findById(outboxRow.id, outboxRow.tenantId)).resolves.toEqual({
      ok: true,
      value: null,
    });
    await expect(empty.complete(outboxRow.id, "token", outboxRow.tenantId)).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      empty.deadLetter(outboxRow.id, "token", "boom", outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: false });
    await expect(empty.claim([outboxRow.id], "worker", 1000, outboxRow.tenantId)).resolves.toEqual({
      ok: true,
      value: [],
    });
    await expect(
      empty.fail(outboxRow.id, "token", "boom", outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: false });

    const deadLetterRow = { ...outboxRow, status: "claimed", attempts: 3, leaseToken: "token" };
    const deadLetterDb = createDbMock({
      transaction: [{ select: [[deadLetterRow]], update: [[{ id: deadLetterRow.id }]] }],
    });
    await expect(
      new PostgresOutboxRepository(deadLetterDb as never).fail(
        outboxRow.id,
        "token",
        "x".repeat(600),
        outboxRow.tenantId,
        3,
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("converts database exceptions into failed results", async () => {
    const rejectingChain = () => ({
      from: vi.fn(() => rejectingChain()),
      where: vi.fn(() => rejectingChain()),
      values: vi.fn(() => rejectingChain()),
      set: vi.fn(() => rejectingChain()),
      returning: vi.fn(() => Promise.reject(new Error("db failure"))),
      limit: vi.fn(() => Promise.reject(new Error("db failure"))),
    });
    const rejectingDb = {
      drizzle: {
        insert: vi.fn(() => rejectingChain()),
        select: vi.fn(() => rejectingChain()),
        update: vi.fn(() => rejectingChain()),
        transaction: vi.fn(() => Promise.reject(new Error("tx failure"))),
      },
    };
    const repo = new PostgresOutboxRepository(rejectingDb as never);
    await expect(repo.create(outboxRow as never)).resolves.toMatchObject({ ok: false });
    await expect(repo.findPending(outboxRow.tenantId, 1)).resolves.toMatchObject({ ok: false });
    await expect(repo.findById(outboxRow.id, outboxRow.tenantId)).resolves.toMatchObject({
      ok: false,
    });
    await expect(repo.complete(outboxRow.id, "token", outboxRow.tenantId)).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      repo.claim([outboxRow.id], "worker", 1000, outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      repo.fail(outboxRow.id, "token", "err", outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      repo.deadLetter(outboxRow.id, "token", "err", outboxRow.tenantId),
    ).resolves.toMatchObject({ ok: false });
  });

  it("accepts postgres execute results wrapped in rows", async () => {
    const db = createDbMock({
      transaction: [{ execute: [{ rows: [{ id: outboxRow.id }] }, { rows: [outboxRow] }] }],
    });
    await expect(
      new PostgresOutboxRepository(db as never).claim(
        [outboxRow.id],
        "worker",
        1000,
        outboxRow.tenantId,
      ),
    ).resolves.toMatchObject({ ok: true, value: [expect.objectContaining({ id: outboxRow.id })] });
  });

  it("fails closed when fail updates affect no rows", async () => {
    const row = { ...outboxRow, status: "claimed", attempts: 1, leaseToken: "token" };
    const deadLetterUpdateMissing = createDbMock({
      transaction: [{ select: [[row]], update: [[]] }],
    });
    await expect(
      new PostgresOutboxRepository(deadLetterUpdateMissing as never).fail(
        row.id,
        "token",
        "err",
        row.tenantId,
        1,
      ),
    ).resolves.toMatchObject({ ok: false });
    const retryUpdateMissing = createDbMock({ transaction: [{ select: [[row]], update: [[]] }] });
    await expect(
      new PostgresOutboxRepository(retryUpdateMissing as never).fail(
        row.id,
        "token",
        "err",
        row.tenantId,
        5,
      ),
    ).resolves.toMatchObject({ ok: false });
  });
});
