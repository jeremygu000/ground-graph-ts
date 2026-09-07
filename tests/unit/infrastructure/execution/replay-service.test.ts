import { describe, expect, it, vi } from "vitest";
import { DefaultReplayService } from "@/infrastructure/execution/replay-service";
import type { ExecutionRunRepository } from "@/application/execution/ports.types";
import type { ExecutionRun } from "@/domain/execution/execution.schema";
import { success } from "@/domain/result";

function createMockRunRepository(runs: ExecutionRun[] = []) {
  return {
    create: vi.fn(async (run: ExecutionRun) => success(run)),
    findById: vi.fn(async (id: string) => {
      const run = runs.find((r) => r.id === id);
      return success(run ?? null);
    }),
    findByStatus: vi.fn(async () => success([])),
    updateStatus: vi.fn(async () => success(runs[0]!)),
    compareAndSetStatus: vi.fn(async () => success(runs[0]!)),
    list: vi.fn(async () => success(runs)),
  } satisfies Partial<ExecutionRunRepository>;
}

describe("DefaultReplayService", () => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const runId = "00000000-0000-4000-8000-000000000099";

  const mockRun: ExecutionRun = {
    id: runId,
    tenantId,
    workflowName: "retrieval",
    workflowVersion: "1.0.0",
    status: "succeeded",
    triggerType: "manual",
    input: { question: "test" },
    output: { answer: "result" },
    versionBundle: {
      workflowVersion: "1.0.0",
    },
  };

  it("returns error when original run not found", async () => {
    const repo = createMockRunRepository([]);
    const service = new DefaultReplayService(repo);
    const result = await service.replayRun("non-existent", tenantId);
    expect(result.ok).toBe(false);
  });

  it("creates new run with replay trigger type", async () => {
    const repo = createMockRunRepository([mockRun]);
    const service = new DefaultReplayService(repo);
    const result = await service.replayRun(runId, tenantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("pending");
    expect(result.value.originalRunId).toBe(runId);
    expect(repo.create).toHaveBeenCalled();
  });

  it("copies version bundle from original run", async () => {
    const repo = createMockRunRepository([mockRun]);
    const service = new DefaultReplayService(repo);
    const result = await service.replayRun(runId, tenantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const createCall = repo.create.mock.calls[0];
    const createdRun = createCall?.[0] as ExecutionRun;
    expect(createdRun.versionBundle).toEqual(mockRun.versionBundle);
  });

  it("sets replayedFromRunId in metadata", async () => {
    const repo = createMockRunRepository([mockRun]);
    const service = new DefaultReplayService(repo);
    const result = await service.replayRun(runId, tenantId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const createCall = repo.create.mock.calls[0];
    const createdRun = createCall?.[0] as ExecutionRun;
    expect(createdRun.metadata?.replayedFromRunId).toBe(runId);
  });
});
