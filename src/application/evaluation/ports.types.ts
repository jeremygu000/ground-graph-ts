import type {
  EvaluationCase,
  EvaluationResult,
  EvaluationDataset,
} from "../../domain/evaluation/evaluation.schema";
import type { Result } from "../../domain/result";
import type { QueryResponse } from "../../domain/retrieval/retrieval.schema";

export interface EvaluationPort {
  evaluateCase(
    evaluationCase: EvaluationCase,
    response: QueryResponse,
  ): Promise<Result<EvaluationResult>>;
  evaluateDataset(datasetId: string, runId: string): Promise<Result<EvaluationResult[]>>;
  getMetrics(result: EvaluationResult): Promise<Result<EvaluationMetric[]>>;
}

export interface EvaluationMetric {
  name: string;
  value: number;
  threshold?: number;
  passed: boolean;
}

export interface EvaluationReporterPort {
  report(results: EvaluationResult[]): Promise<Result<void>>;
  generateSummary(results: EvaluationResult[]): Promise<Result<EvaluationSummary>>;
  exportResults(
    results: EvaluationResult[],
    format: "json" | "csv" | "markdown",
  ): Promise<Result<string>>;
}

export interface EvaluationSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  metrics: Record<
    string,
    {
      average: number;
      min: number;
      max: number;
      threshold?: number;
    }
  >;
  regressions: Array<{
    metricName: string;
    previousValue: number;
    currentValue: number;
    threshold: number;
  }>;
}

export interface GoldenDatasetPort {
  load(datasetId: string): Promise<Result<EvaluationDataset>>;
  save(dataset: EvaluationDataset): Promise<Result<void>>;
  list(): Promise<Result<Array<{ id: string; name: string; version: string }>>>;
}
