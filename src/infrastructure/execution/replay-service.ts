import { randomUUID } from "node:crypto";
import type { ReplayService, ReplayResult } from "../../application/execution/replay-service.types";
import type { ExecutionRunRepository } from "../../application/execution/ports.types";
import type { Result } from "../../domain/result";
import { ExecutionRunSchema } from "../../domain/execution/execution.schema";
import type { ExecutionRun } from "../../domain/execution/execution.schema";
import { validateOrThrow } from "../../domain/validation";

export class DefaultReplayService implements ReplayService {
  constructor(private readonly runRepository: ExecutionRunRepository) {}

  async replayRun(
    runId: string,
    tenantId: string,
    _options?: { forceVersionBundle?: boolean; maxRetries?: number },
  ): Promise<Result<ReplayResult>> {
    const originalResult = await this.runRepository.findById(runId, tenantId);
    if (!originalResult.ok) {
      return originalResult;
    }

    const originalRun = originalResult.value;
    if (!originalRun) {
      return {
        ok: false,
        error: new Error(`Run not found: ${runId}`),
      };
    }

    const newRunId = randomUUID();
    const newTraceId = randomUUID();

    const newRun: ExecutionRun = validateOrThrow(
      ExecutionRunSchema,
      {
        id: newRunId,
        tenantId: originalRun.tenantId,
        workflowName: originalRun.workflowName,
        workflowVersion: originalRun.workflowVersion,
        status: "pending",
        triggerType: "replay",
        input: originalRun.input,
        output: undefined,
        error: undefined,
        traceId: newTraceId,
        spanId: undefined,
        startedAt: undefined,
        completedAt: undefined,
        metadata: {
          ...originalRun.metadata,
          replayedFromRunId: runId,
        },
        versionBundle: originalRun.versionBundle,
      },
      "ReplayService.create",
    );

    const createResult = await this.runRepository.create(newRun);
    if (!createResult.ok) {
      return createResult;
    }

    return {
      ok: true,
      value: {
        newRunId,
        originalRunId: runId,
        traceId: newTraceId,
        status: "pending",
      },
    };
  }
}
