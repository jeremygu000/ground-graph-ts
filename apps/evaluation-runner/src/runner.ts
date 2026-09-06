import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export interface BaselineReport {
  version: string;
  generatedAt: string;
  datasetVersion: string;
  embeddingModel: string;
  embeddingDimension: number;
  rerankerModel: string;
  generatorModel: string;
  indexVersion: string;
  cases: BaselineCaseResult[];
  summary: BaselineSummary;
}

export interface BaselineCaseResult {
  caseId: string;
  status: "pending" | "running" | "completed" | "skipped";
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
  skippedCases: number;
  retrievalRecall: { average: number; p50: number; p95: number } | null;
  answerCorrectness: { average: number; p50: number; p95: number } | null;
  citationCorrectness: { average: number; p50: number; p95: number } | null;
  refusalCorrectness: { percentage: number } | null;
  aclLeakage: { percentage: number } | null;
  latencyMs: { p50: number; p95: number } | null;
  totalCostUSD: number;
}

function loadDataset(datasetPath: string): {
  cases: BaselineCase[];
  metadata: Record<string, unknown>;
} {
  const content = readFileSync(datasetPath, "utf-8");
  const data = JSON.parse(content);

  return {
    cases: data.cases,
    metadata: {
      name: data.name,
      version: data.version,
      description: data.description,
      embedding_model: data.embedding_model,
      embedding_dimension: data.embedding_dimension,
      reranker_model: data.reranker_model,
      generator_model: data.generator_model,
    },
  };
}

function createBaselineReport(
  cases: BaselineCase[],
  metadata: Record<string, unknown>,
): BaselineReport {
  const caseResults: BaselineCaseResult[] = cases.map((c) => ({
    caseId: c.id,
    status: "skipped" as const,
    retrievalRecall: null,
    retrievalHit: null,
    answerCorrectness: null,
    citationCorrectness: null,
    refusalCorrectness: null,
    aclLeakage: null,
    latencyMs: null,
    promptTokens: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUSD: null,
    error: "M4 baseline not yet executed - runner implemented, pipeline pending",
  }));

  const summary: BaselineSummary = {
    totalCases: cases.length,
    completedCases: 0,
    skippedCases: cases.length,
    retrievalRecall: null,
    answerCorrectness: null,
    citationCorrectness: null,
    refusalCorrectness: null,
    aclLeakage: null,
    latencyMs: null,
    totalCostUSD: 0,
  };

  return {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    datasetVersion: String(metadata.version ?? "unknown"),
    embeddingModel: String(metadata.embedding_model ?? "unknown"),
    embeddingDimension: Number(metadata.embedding_dimension ?? 0),
    rerankerModel: String(metadata.reranker_model ?? "unknown"),
    generatorModel: String(metadata.generator_model ?? "unknown"),
    indexVersion: "pending",
    cases: caseResults,
    summary,
  };
}

export async function runBaseline(): Promise<BaselineReport> {
  const projectRoot = join(__dirname, "..", "..");
  const datasetPath = join(projectRoot, "evals", "datasets", "m4-vector-baseline.json");

  console.log(`Loading dataset from: ${datasetPath}`);
  const { cases, metadata } = loadDataset(datasetPath);
  console.log(`Loaded ${cases.length} evaluation cases`);

  const report = createBaselineReport(cases, metadata);

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBaseline()
    .then((report) => {
      console.log("\n=== M4 Vector Baseline Report ===");
      console.log(`Version: ${report.version}`);
      console.log(`Generated: ${report.generatedAt}`);
      console.log(`Dataset: ${report.datasetVersion}`);
      console.log(`Embedding: ${report.embeddingModel} (${report.embeddingDimension}d)`);
      console.log(`Generator: ${report.generatorModel}`);
      console.log(`\nTotal cases: ${report.summary.totalCases}`);
      console.log(`Skipped: ${report.summary.skippedCases}`);
      console.log(
        "\nNote: This is a placeholder baseline. Run with actual pipeline to populate results.",
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to run baseline:", err);
      process.exit(1);
    });
}
