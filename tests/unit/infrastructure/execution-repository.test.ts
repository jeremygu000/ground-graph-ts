import { describe, expect, it, vi } from "vitest";
import {
  PostgresExecutionRunRepository,
  PostgresExecutionStepRepository,
} from "../../../src/infrastructure/postgres/repositories/execution-repository";

type QueueMap = {
  select?: unknown[];
  insert?: unknown[];
  update?: unknown[];
  execute?: unknown[];
  transaction?: unknown[];
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
  const tx = createTxMock(queues.transaction ? (queues.transaction[0] as QueueMap) : {});
  const selectQueue = [...(queues.select ?? [])];
  const insertQueue = [...(queues.insert ?? [])];
  const updateQueue = [...(queues.update ?? [])];
  const executeQueue = [...(queues.execute ?? [])];

  return {
    drizzle: {
      select: vi.fn(() => createThenable(selectQueue.shift())),
      insert: vi.fn(() => createThenable(insertQueue.shift())),
      update: vi.fn(() => createThenable(updateQueue.shift())),
      execute: vi.fn(() => Promise.resolve(executeQueue.shift())),
      transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(tx)),
    },
  };
}

const runRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantId: "22222222-2222-4222-8222-222222222222",
  workflowName: "ingestion",
  workflowVersion: "1.0.0",
  status: "pending",
  triggerType: "manual",
  input: { sourceUri: "https://example.com/doc.md" },
  output: undefined,
  error: undefined,
  traceId: "trace",
  spanId: "span",
  startedAt: "2024-01-01T00:00:00.000Z",
  completedAt: undefined,
  metadata: { source: "test" },
  versionBundle: { workflowVersion: "1.0.0" },
  createdAt: "2024-01-01T00:00:00.000Z",
};

const stepRow = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  runId: runRow.id,
  stepName: "parse",
  stepType: "parser",
  status: "pending",
  input: { sourceUri: "https://example.com/doc.md" },
  output: undefined,
  error: undefined,
  startedAt: undefined,
  completedAt: undefined,
  retryCount: 0,
  metadata: { source: "test" },
};

describe("execution repositories", () => {
  it("covers execution run repository", async () => {
    const db = createDbMock({
      insert: [[runRow]],
      select: [[runRow], [runRow], [runRow]],
      update: [[runRow], [runRow]],
    });
    const repo = new PostgresExecutionRunRepository(db as never);

    await expect(repo.create(runRow as never)).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(runRow.id, runRow.tenantId)).resolves.toMatchObject({ ok: true });
    await expect(repo.findByStatus("pending", runRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.updateStatus(runRow.id, runRow.tenantId, "running")).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.compareAndSetStatus(runRow.id, runRow.tenantId, "running", "succeeded"),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.list(runRow.tenantId)).resolves.toMatchObject({ ok: true });
  });

  it("covers execution step repository", async () => {
    const db = createDbMock({
      insert: [[stepRow]],
      select: [[{ step: stepRow }], [{ step: stepRow }], [{ step: stepRow }], [{ step: stepRow }]],
      update: [[stepRow], [stepRow]],
      execute: [[], []],
      transaction: [
        {
          select: [[{ runId: runRow.id }], [{ runId: runRow.id }], [{ id: runRow.id }]],
          execute: [[]],
          insert: [[]],
        },
      ],
    });
    const repo = new PostgresExecutionStepRepository(db as never);

    await expect(repo.create(stepRow as never)).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(stepRow.id, runRow.tenantId)).resolves.toMatchObject({ ok: true });
    await expect(repo.findByRunId(runRow.id, runRow.tenantId)).resolves.toMatchObject({ ok: true });
    await expect(repo.updateStatus(stepRow.id, runRow.tenantId, "running")).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.compareAndSetStatus(stepRow.id, runRow.tenantId, "running", "succeeded"),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repo.addDependency(stepRow.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", runRow.tenantId),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(repo.getDependencies(stepRow.id, runRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
  });
});
