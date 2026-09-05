import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgresExecutionRunRepository,
  PostgresExecutionStepRepository,
} from "../../src/infrastructure/postgres/repositories/execution-repository";
import { startComponentDatabase } from "./test-support";

describe("PostgresExecutionStepRepository", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let runRepo: PostgresExecutionRunRepository;
  let stepRepo: PostgresExecutionStepRepository;
  const tenantId = crypto.randomUUID();
  let runId = "";

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    runRepo = new PostgresExecutionRunRepository(ctx.db);
    stepRepo = new PostgresExecutionStepRepository(ctx.db);
  }, 120_000);

  beforeEach(async () => {
    await ctx.reset();
    const created = await runRepo.create({
      id: crypto.randomUUID(),
      tenantId,
      workflowName: "ingest",
      workflowVersion: "1.0.0",
      status: "pending",
      triggerType: "manual",
      input: { source: "component-test" },
      output: undefined,
      error: undefined,
      traceId: undefined,
      spanId: undefined,
      startedAt: undefined,
      completedAt: undefined,
      metadata: undefined,
      versionBundle: { workflowVersion: "1.0.0" },
    });
    expect(created.ok, created.ok ? undefined : created.error.message).toBe(true);
    if (!created.ok) throw created.error;
    runId = created.value.id;
  });

  it("compareAndSetStatus updates only the expected status", async () => {
    const created = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "parse",
      stepType: "parser",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    expect(created.ok, created.ok ? undefined : created.error.message).toBe(true);
    if (!created.ok) throw created.error;

    const result = await stepRepo.compareAndSetStatus(
      created.value.id,
      tenantId,
      "pending",
      "running",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.status).toBe("running");
  });

  it("rejects cross-run dependency cycles", async () => {
    const createdA = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "a",
      stepType: "task",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    const createdB = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "b",
      stepType: "task",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    const createdC = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "c",
      stepType: "task",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    for (const created of [createdA, createdB, createdC]) {
      expect(created.ok).toBe(true);
      if (!created.ok) throw created.error;
    }

    const a = createdA.ok ? createdA.value.id : "";
    const b = createdB.ok ? createdB.value.id : "";
    const c = createdC.ok ? createdC.value.id : "";

    const first = await stepRepo.addDependency(a, b, tenantId);
    const second = await stepRepo.addDependency(b, c, tenantId);
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    const cycle = await stepRepo.addDependency(c, a, tenantId);
    expect(cycle.ok).toBe(false);
    if (cycle.ok) throw new Error("expected cycle rejection");
    expect(cycle.error.message).toContain("cycle");
  });

  it("rejects self dependency", async () => {
    const created = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "self",
      stepType: "task",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    expect(created.ok, created.ok ? undefined : created.error.message).toBe(true);
    if (!created.ok) throw created.error;

    const self = await stepRepo.addDependency(created.value.id, created.value.id, tenantId);
    expect(self.ok).toBe(false);
    if (self.ok) throw new Error("expected self dependency rejection");
    expect(self.error.message).toContain("itself");
  });

  it("preserves tenant isolation when reading dependencies", async () => {
    const created = await stepRepo.create({
      id: crypto.randomUUID(),
      runId,
      stepName: "root",
      stepType: "task",
      status: "pending",
      input: undefined,
      output: undefined,
      error: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      metadata: undefined,
    });
    expect(created.ok, created.ok ? undefined : created.error.message).toBe(true);
    if (!created.ok) throw created.error;

    const dependencies = await stepRepo.getDependencies(created.value.id, tenantId);
    expect(dependencies.ok).toBe(true);
    if (!dependencies.ok) throw dependencies.error;
    expect(dependencies.value).toEqual([]);
  });
});
