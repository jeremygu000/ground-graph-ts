export interface RetrievalQuery {
  question: string;
  tenantId: string;
  principalId: string;
  strategy: "vector" | "fulltext";
  maxResults?: number;
}

export interface BaselineCase {
  id: string;
  type: string;
  tags: string[];
  question: string;
  tenantId: string;
  principalId: string;
  expectedStatus: string;
  expectedAnswer: string;
  requiredClaimText: string;
  forbiddenClaimText: string[];
  expectedEntities: string[];
  expectedEvidenceChunkIds: string[];
}

export interface BaselineCaseResult {
  caseId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  retrievalRecall: number | null;
  retrievalHit: boolean | null;
  answerCorrectness: number | null;
  citationCorrectness: number | null;
  refusalCorrectness: boolean | null;
  aclLeakage: boolean | null;
  latencyMs: number | null;
  promptTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUSD: number | null;
  error: string | null;
}

export interface BaselineSummary {
  totalCases: number;
  completedCases: number;
  failedCases: number;
  skippedCases: number;
  retrievalRecall: { average: number; p50: number; p95: number } | null;
  answerCorrectness: { average: number; p50: number; p95: number } | null;
  citationCorrectness: { average: number; p50: number; p95: number } | null;
  refusalCorrectness: { percentage: number } | null;
  aclLeakage: { percentage: number } | null;
  latencyMs: { p50: number; p95: number } | null;
  totalCostUSD: number | null;
}

export interface BaselineReport {
  version: string;
  generatedAt: string;
  datasetVersion: string;
  evaluationMode: string;
  embeddingModel: string | null;
  embeddingDimension: number | null;
  rerankerModel: string | null;
  generatorModel: string | null;
  indexVersion: string | null;
  cases: BaselineCaseResult[];
  summary: BaselineSummary;
}

export interface DatasetMetadata {
  name: string;
  version: string;
  description: string;
  embedding_model: string;
  embedding_dimension: number;
  reranker_model: string;
  generator_model: string;
  cases: BaselineCase[];
}

export interface CorpusChunk {
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
}

export interface OkResult<T> {
  ok: true;
  value: T;
}
