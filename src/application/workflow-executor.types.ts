import type { RetrievalWorkflowInput } from "./retrieval/workflow.types";
import type { Result } from "../domain/result";

export interface WorkflowExecutorPort {
  executeRetrieval(input: RetrievalWorkflowInput): Promise<Result<unknown>>;
  executeIngestion(input: unknown): Promise<Result<unknown>>;
}
