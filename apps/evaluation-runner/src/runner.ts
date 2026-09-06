import { readFileSync, writeFileSync } from "fs";
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
  totalCostUSD: number;
}

interface DatasetMetadata {
  name: string;
  version: string;
  description: string;
  embedding_model: string;
  embedding_dimension: number;
  reranker_model: string;
  generator_model: string;
  cases: BaselineCase[];
}

function loadDataset(datasetPath: string): { cases: BaselineCase[]; metadata: DatasetMetadata } {
  const content = readFileSync(datasetPath, "utf-8");
  const data: DatasetMetadata = JSON.parse(content);

  return {
    cases: data.cases,
    metadata: data,
  };
}

function computePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function executeCase(evaluationCase: BaselineCase): Promise<BaselineCaseResult> {
  const startTime = Date.now();

  return {
    caseId: evaluationCase.id,
    status: "skipped",
    retrievalRecall: null,
    retrievalHit: null,
    answerCorrectness: null,
    citationCorrectness: null,
    refusalCorrectness: null,
    aclLeakage: null,
    latencyMs: Date.now() - startTime,
    promptTokens: null,
    inputTokens: null,
    outputTokens: null,
    estimatedCostUSD: null,
    error:
      "M4 pipeline not yet integrated - requires VectorQueryService with live embeddings and generator",
  };
}

async function runBaseline(): Promise<BaselineReport> {
  const projectRoot = join(__dirname, "..", "..", "..");
  const datasetPath = join(projectRoot, "evals", "datasets", "m4-vector-baseline.json");
  const outputPath = join(projectRoot, "evals", "reports", "m4-vector-baseline-v1.json");

  console.log(`Loading dataset from: ${datasetPath}`);
  const { cases, metadata } = loadDataset(datasetPath);
  console.log(`Loaded ${cases.length} evaluation cases`);

  const caseResults: BaselineCaseResult[] = [];
  const completedResults: BaselineCaseResult[] = [];
  const failedResults: BaselineCaseResult[] = [];
  const skippedResults: BaselineCaseResult[] = [];

  console.log("\nExecuting evaluation cases...");
  for (let i = 0; i < cases.length; i++) {
    const evaluationCase = cases[i]!;
    console.log(`  [${i + 1}/${cases.length}] Case ${evaluationCase.id}: ${evaluationCase.type}`);

    const result = await executeCase(evaluationCase);
    caseResults.push(result);

    if (result.status === "completed") {
      completedResults.push(result);
    } else if (result.status === "failed") {
      failedResults.push(result);
    } else {
      skippedResults.push(result);
    }
  }

  const retrievalRecalls = completedResults
    .map((r) => r.retrievalRecall)
    .filter((v): v is number => v !== null);
  const answerCorrectnesses = completedResults
    .map((r) => r.answerCorrectness)
    .filter((v): v is number => v !== null);
  const citationCorrectnesses = completedResults
    .map((r) => r.citationCorrectness)
    .filter((v): v is number => v !== null);
  const refusalCorrectness = completedResults.filter((r) => r.refusalCorrectness !== null);
  const refusalCorrectCount = refusalCorrectness.filter(
    (r) => r.refusalCorrectness === true,
  ).length;
  const aclLeakage = completedResults.filter((r) => r.aclLeakage !== null);
  const aclLeakCount = aclLeakage.filter((r) => r.aclLeakage === true).length;
  const latencies = completedResults.map((r) => r.latencyMs).filter((v): v is number => v !== null);
  const costs = completedResults
    .map((r) => r.estimatedCostUSD)
    .filter((v): v is number => v !== null);

  const summary: BaselineSummary = {
    totalCases: cases.length,
    completedCases: completedResults.length,
    failedCases: failedResults.length,
    skippedCases: skippedResults.length,
    retrievalRecall:
      retrievalRecalls.length > 0
        ? {
            average: computeAverage(retrievalRecalls),
            p50: computePercentile(retrievalRecalls, 50),
            p95: computePercentile(retrievalRecalls, 95),
          }
        : null,
    answerCorrectness:
      answerCorrectnesses.length > 0
        ? {
            average: computeAverage(answerCorrectnesses),
            p50: computePercentile(answerCorrectnesses, 50),
            p95: computePercentile(answerCorrectnesses, 95),
          }
        : null,
    citationCorrectness:
      citationCorrectnesses.length > 0
        ? {
            average: computeAverage(citationCorrectnesses),
            p50: computePercentile(citationCorrectnesses, 50),
            p95: computePercentile(citationCorrectnesses, 95),
          }
        : null,
    refusalCorrectness:
      refusalCorrectness.length > 0
        ? { percentage: (refusalCorrectCount / refusalCorrectness.length) * 100 }
        : null,
    aclLeakage:
      aclLeakage.length > 0 ? { percentage: (aclLeakCount / aclLeakage.length) * 100 } : null,
    latencyMs:
      latencies.length > 0
        ? { p50: computePercentile(latencies, 50), p95: computePercentile(latencies, 95) }
        : null,
    totalCostUSD: costs.reduce((a, b) => a + b, 0),
  };

  const report: BaselineReport = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    datasetVersion: metadata.version,
    embeddingModel: metadata.embedding_model,
    embeddingDimension: metadata.embedding_dimension,
    rerankerModel: metadata.reranker_model,
    generatorModel: metadata.generator_model,
    indexVersion: "pending",
    cases: caseResults,
    summary,
  };

  console.log(`\nWriting report to: ${outputPath}`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));

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
      console.log(`Completed: ${report.summary.completedCases}`);
      console.log(`Failed: ${report.summary.failedCases}`);
      console.log(`Skipped: ${report.summary.skippedCases}`);

      if (report.summary.retrievalRecall) {
        console.log(
          `\nRetrieval Recall - Avg: ${report.summary.retrievalRecall.average.toFixed(3)}, P50: ${report.summary.retrievalRecall.p50.toFixed(3)}, P95: ${report.summary.retrievalRecall.p95.toFixed(3)}`,
        );
      }
      if (report.summary.latencyMs) {
        console.log(
          `\nLatency - P50: ${report.summary.latencyMs.p50}ms, P95: ${report.summary.latencyMs.p95}ms`,
        );
      }
      if (report.summary.totalCostUSD > 0) {
        console.log(`\nTotal estimated cost: $${report.summary.totalCostUSD.toFixed(6)}`);
      }

      console.log("\nBaseline artifact written to evals/reports/m4-vector-baseline-v1.json");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to run baseline:", err);
      process.exit(1);
    });
}
