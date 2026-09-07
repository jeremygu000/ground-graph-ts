import type { RunStatus } from "../../domain/execution/execution.schema";
import type { Result } from "../../domain/result";

export interface ReplayOptions {
  forceVersionBundle?: boolean;
  maxRetries?: number;
}

export interface ReplayResult {
  newRunId: string;
  originalRunId: string;
  traceId: string;
  status: RunStatus;
}

export interface ReplayService {
  replayRun(
    runId: string,
    tenantId: string,
    options?: ReplayOptions,
  ): Promise<Result<ReplayResult>>;
}
