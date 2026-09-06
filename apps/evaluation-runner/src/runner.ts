import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  InMemoryEmbeddingAdapter,
  InMemoryVectorIndex,
  type InMemoryVectorIndexEntry,
} from "../../../src/infrastructure/models/in-memory";
import { cosineSimilarity } from "../../../src/infrastructure/models/in-memory";
import { ReciprocalRankFusion } from "../../../src/infrastructure/postgres/fusion";
import { CitationBuilder } from "../../../src/infrastructure/retrieval/citation-builder";
import { DefaultVectorQueryService } from "../../../src/infrastructure/retrieval/vector-query-service";
import type {
  VectorQueryService,
  VectorIndexPort,
  EmbeddingPort,
  VectorSearchResultRow,
} from "../../../src/application/models/ports";
interface RetrievalQuery {
  question: string;
  tenantId: string;
  principalId: string;
  strategy: "vector" | "fulltext";
  maxResults?: number;
}

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
  evaluationMode: string;
  embeddingModel: string | null;
  embeddingDimension: number | null;
  rerankerModel: string | null;
  generatorModel: string | null;
  indexVersion: string | null;
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
  totalCostUSD: number | null;
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

interface CorpusChunk {
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
}

export function loadDataset(datasetPath: string): {
  cases: BaselineCase[];
  metadata: DatasetMetadata;
} {
  const content = readFileSync(datasetPath, "utf-8");
  const data: DatasetMetadata = JSON.parse(content);
  return { cases: data.cases, metadata: data };
}

function loadCorpus(): CorpusChunk[] {
  const projectRoot = join(__dirname, "..", "..", "..");
  const corpusPath = join(projectRoot, "evals", "retrieval", "corpus.json");
  const raw = readFileSync(corpusPath, "utf8");
  const data = JSON.parse(raw) as {
    chunks: Array<{
      chunkId: string;
      documentVersionId: string;
      documentId?: string;
      content: string;
      locator: Record<string, unknown>;
    }>;
  };
  return data.chunks.map(
    (c: {
      chunkId: string;
      documentVersionId: string;
      documentId?: string;
      content: string;
      locator: Record<string, unknown>;
    }) => ({
      chunkId: c.chunkId,
      documentVersionId: c.documentVersionId,
      documentId: c.documentId ?? c.documentVersionId,
      content: c.content,
      locator: c.locator,
    }),
  );
}

export function computePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export function computeAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface OkResult<T> {
  ok: true;
  value: T;
}

function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}

export function createInMemoryVectorPort(
  index: InMemoryVectorIndex,
  corpus: CorpusChunk[],
  indexVersionId: string,
  tenantId: string,
  allowedTenantIds: string[] = [tenantId],
): VectorIndexPort {
  const EMBEDDING_MODEL = "offline-deterministic";
  const EMBEDDING_DIM = 1536;

  index.registerVersion(tenantId, indexVersionId, {
    versionNumber: 1,
    model: EMBEDDING_MODEL,
    dimension: EMBEDDING_DIM,
  });
  index.setActiveIndex(tenantId, indexVersionId);
  for (const allowedTenantId of allowedTenantIds) {
    if (allowedTenantId !== tenantId) {
      index.registerVersion(allowedTenantId, indexVersionId, {
        versionNumber: 1,
        model: EMBEDDING_MODEL,
        dimension: EMBEDDING_DIM,
      });
      index.setActiveIndex(allowedTenantId, indexVersionId);
    }
  }

  return {
    async getActiveIndexVersion(tid) {
      if (!allowedTenantIds.includes(tid)) return ok(null);
      return ok({
        indexVersionId,
        versionNumber: 1,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDimension: EMBEDDING_DIM,
        isActive: true,
        tenantId,
      });
    },
    async upsertEmbeddings(_chunks, embeddings, vid) {
      const entries: InMemoryVectorIndexEntry[] = embeddings.map((emb, i) => {
        const c = corpus[i]!;
        return {
          tenantId,
          chunkId: c.chunkId,
          documentVersionId: c.documentVersionId,
          documentId: c.documentId,
          content: c.content,
          locator: c.locator,
          metadata: {},
          embedding: emb,
          indexVersionId: vid,
          embeddingModel: EMBEDDING_MODEL,
          dimension: EMBEDDING_DIM,
        };
      });
      index.upsert(entries);
      return ok({ upserted: embeddings.length, indexVersionId: vid });
    },
    async search(queryEmbedding, tid, options) {
      if (!allowedTenantIds.includes(tid)) return ok([]);
      const limit = options?.limit ?? 20;
      const entries = index.search(tid, queryEmbedding, {
        limit,
        minScore: options?.minScore ?? 0,
      });
      const results: VectorSearchResultRow[] = entries.map((e) => ({
        chunkId: e.chunkId,
        documentVersionId: e.documentVersionId,
        documentId: e.documentId,
        content: e.content,
        locator: e.locator,
        metadata: e.metadata,
        score: cosineSimilarity(queryEmbedding, e.embedding),
        indexVersionId: e.indexVersionId,
        embeddingModel: e.embeddingModel,
      }));
      return ok(results);
    },
    async deleteByDocumentVersion(docVid) {
      const deleted = index.deleteByDocumentVersion(docVid);
      return ok({ deleted });
    },
  };
}

export function createGeneratorStub() {
  const stopWords = new Set([
    "what",
    "which",
    "how",
    "does",
    "are",
    "is",
    "the",
    "in",
    "of",
    "on",
    "for",
    "with",
    "and",
    "or",
    "to",
    "a",
    "an",
    "this",
    "that",
  ]);
  return {
    async generateStructured(request: {
      question: string;
      evidence: Array<{ snippet: string; citationId: string }>;
    }) {
      if (request.evidence.length === 0) {
        return ok({
          structured: {
            answer: "",
            status: "insufficient_evidence" as const,
            claims: [],
            refusalReason: "offline-deterministic-mode-no-evidence",
          },
          model: "offline-stub",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          finishReason: "stop" as const,
          repairAttempts: 0,
        });
      }
      const evidenceText = request.evidence.map((e) => e.snippet).join(" ");
      const questionTerms = new Set(
        request.question
          .toLocaleLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((term) => term.length > 2 && !stopWords.has(term)),
      );
      const evidenceTerms = new Set(
        evidenceText
          .toLocaleLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((term) => term.length > 2 && !stopWords.has(term)),
      );
      if (![...questionTerms].some((term) => evidenceTerms.has(term))) {
        return ok({
          structured: {
            answer: "",
            status: "insufficient_evidence" as const,
            claims: [],
            refusalReason: "offline-deterministic-mode-no-matching-evidence",
          },
          model: "offline-stub",
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          finishReason: "stop" as const,
          repairAttempts: 0,
        });
      }
      const answer = `[DETERMINISTIC] Based on evidence: ${evidenceText.substring(0, 200)}`;
      return ok({
        structured: {
          answer,
          status: "answered" as const,
          claims: [
            {
              claimId: crypto.randomUUID(),
              claimText: evidenceText.substring(0, 100),
              citations: request.evidence.map((e) => ({
                citationId: e.citationId,
                evidenceId: crypto.randomUUID(),
                chunkId: "",
                documentVersionId: "",
                locatorPath: "",
                snippet: e.snippet,
                startChar: 0,
                endChar: 0,
                score: 1,
              })),
              confidence: 1,
              supportedBy: request.evidence.map((e) => e.citationId),
            },
          ],
          refusalReason: "",
        },
        model: "offline-stub",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        finishReason: "stop" as const,
        repairAttempts: 0,
      });
    },
    getModel() {
      return "offline-stub";
    },
  };
}

export function createVectorService(
  embedding: EmbeddingPort,
  vector: VectorIndexPort,
): VectorQueryService {
  return new DefaultVectorQueryService({
    embedding,
    vector,
    fulltext: null,
    reranker: null,
    fusion: new ReciprocalRankFusion(),
    generator: createGeneratorStub(),
    citationBuilder: new CitationBuilder(),
    config: {
      embedding: { provider: "local" as const, model: "offline-deterministic", dimension: 1536 },
      reranker: { provider: "none" as const, model: "offline-stub" },
      generator: { model: "offline-stub" },
      maxCandidates: 20,
      enableFullText: false,
      enableRerank: false,
      enableGeneration: true,
      fusionWeights: { vector: 1 },
      refusalMinCitations: 1,
      refusalMinConfidence: 0.5,
    },
    clock: () => new Date(),
    idGen: () => crypto.randomUUID(),
  });
}

async function runBaseline(): Promise<BaselineReport> {
  const projectRoot = join(__dirname, "..", "..", "..");
  const datasetPath = join(projectRoot, "evals", "datasets", "m4-vector-baseline.json");
  const outputPath = join(projectRoot, "evals", "reports", "m4-vector-offline-baseline-v1.json");

  console.log(`Loading dataset from: ${datasetPath}`);
  const { cases, metadata } = loadDataset(datasetPath);
  console.log(`Loaded ${cases.length} evaluation cases`);

  console.log("Loading corpus...");
  const corpus = loadCorpus();
  console.log(`Loaded ${corpus.length} corpus chunks`);

  const indexVersionId = "00000000-0000-4000-8000-000000000001";
  const tenantId = "00000000-0000-4000-8000-000000000001";

  const embedding = new InMemoryEmbeddingAdapter("offline-deterministic", 1536);
  const index = new InMemoryVectorIndex();
  const vectorPort = createInMemoryVectorPort(index, corpus, indexVersionId, tenantId, [
    ...new Set(cases.map((evaluationCase) => evaluationCase.tenantId)),
  ]);
  const vectorService = createVectorService(embedding, vectorPort);

  console.log("Building vector index...");
  const embedResult = await embedding.embedBatch({
    inputs: corpus.map((c) => c.content),
    tenantId,
  });

  if (embedResult.ok) {
    const entries: InMemoryVectorIndexEntry[] = corpus.map((c, idx) => ({
      chunkId: c.chunkId,
      documentVersionId: c.documentVersionId,
      documentId: c.documentId,
      content: c.content,
      locator: c.locator,
      metadata: {},
      embedding: embedResult.value.embeddings[idx]!.embedding,
      indexVersionId,
      embeddingModel: "offline-deterministic",
      dimension: 1536,
    }));

    await vectorPort.upsertEmbeddings(
      entries as unknown as Parameters<typeof vectorPort.upsertEmbeddings>[0],
      entries.map((e) => e.embedding),
      indexVersionId,
      tenantId,
    );
    console.log(`Indexed ${corpus.length} chunks`);
  }

  const caseResults: BaselineCaseResult[] = [];
  const completedResults: BaselineCaseResult[] = [];
  const failedResults: BaselineCaseResult[] = [];
  const skippedResults: BaselineCaseResult[] = [];

  console.log("\nExecuting evaluation cases...");
  for (let i = 0; i < cases.length; i++) {
    const evaluationCase = cases[i]!;
    console.log(`  [${i + 1}/${cases.length}] Case ${evaluationCase.id}: ${evaluationCase.type}`);

    const result = await evaluateCase(evaluationCase, vectorService);
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
  const refusalCases = completedResults.filter((r) => r.refusalCorrectness !== null);
  const refusalCorrectCount = refusalCases.filter((r) => r.refusalCorrectness === true).length;
  const aclCases = completedResults.filter((r) => r.aclLeakage !== null);
  const aclLeakCount = aclCases.filter((r) => r.aclLeakage === true).length;
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
      refusalCases.length > 0
        ? { percentage: (refusalCorrectCount / refusalCases.length) * 100 }
        : null,
    aclLeakage: aclCases.length > 0 ? { percentage: (aclLeakCount / aclCases.length) * 100 } : null,
    latencyMs:
      latencies.length > 0
        ? { p50: computePercentile(latencies, 50), p95: computePercentile(latencies, 95) }
        : null,
    totalCostUSD: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
  };

  const report: BaselineReport = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    datasetVersion: metadata.version,
    evaluationMode: "offline-deterministic-generation",
    embeddingModel: "offline-deterministic",
    embeddingDimension: 1536,
    rerankerModel: null,
    generatorModel: "offline-stub",
    indexVersion: indexVersionId,
    cases: caseResults,
    summary,
  };

  console.log(`\nWriting report to: ${outputPath}`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return report;
}

async function evaluateCase(
  evaluationCase: BaselineCase,
  vectorService: VectorQueryService,
): Promise<BaselineCaseResult> {
  const startTime = Date.now();

  try {
    const query: RetrievalQuery = {
      question: evaluationCase.question,
      tenantId: evaluationCase.tenantId,
      principalId: evaluationCase.principalId,
      strategy: "vector",
      maxResults: 10,
    };

    const result = await vectorService.query(query as Parameters<typeof vectorService.query>[0]);

    if (!result.ok) {
      return {
        caseId: evaluationCase.id,
        status: "failed",
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
        error: result.error instanceof Error ? result.error.message : String(result.error),
      };
    }

    const retrievalResult = result.value;

    const expectedChunkIds = evaluationCase.expectedEvidenceChunkIds;
    const retrievedChunkIds = retrievalResult.results.map((r) => r.chunkId);

    const retrievedExpectedCount = expectedChunkIds.filter((id) =>
      retrievedChunkIds.includes(id),
    ).length;
    const retrievalRecall =
      expectedChunkIds.length > 0 ? retrievedExpectedCount / expectedChunkIds.length : null;
    const retrievalHit = expectedChunkIds.some((id) => retrievedChunkIds.includes(id));

    const citedChunkIds = retrievalResult.citations.map((citation) => citation.chunkId);
    const correctlyCitedCount = expectedChunkIds.filter((id) => citedChunkIds.includes(id)).length;
    const citationCorrectness: number | null =
      expectedChunkIds.length > 0
        ? correctlyCitedCount / expectedChunkIds.length
        : citedChunkIds.length === 0
          ? 1
          : 0;

    const hasEvidence = retrievalResult.results.length > 0;
    const expectedStatus = evaluationCase.expectedStatus;
    const generated = retrievalResult.generatedAnswer;
    const actualStatus = generated?.status ?? (hasEvidence ? "answered" : "insufficient_evidence");

    const refusalCorrectness =
      expectedStatus === "insufficient_evidence" || expectedStatus === "refused"
        ? actualStatus === expectedStatus
        : null;

    const answerText = generated?.answer ?? "";
    const normalizedAnswer = answerText.toLocaleLowerCase();
    const hasRequiredClaim =
      evaluationCase.requiredClaimText.trim().length === 0 ||
      normalizedAnswer.includes(evaluationCase.requiredClaimText.toLocaleLowerCase());
    const hasForbiddenClaim = evaluationCase.forbiddenClaimText.some((text) =>
      normalizedAnswer.includes(text.toLocaleLowerCase()),
    );
    const answerCorrectness: number | null =
      expectedStatus === "answered" && actualStatus === "answered"
        ? generated !== undefined &&
          generated.claims.length > 0 &&
          hasRequiredClaim &&
          !hasForbiddenClaim
          ? 1
          : 0
        : expectedStatus !== "answered"
          ? null
          : 0;

    const aclLeakage: boolean | null = null;

    return {
      caseId: evaluationCase.id,
      status: "completed",
      retrievalRecall,
      retrievalHit,
      answerCorrectness,
      citationCorrectness,
      refusalCorrectness,
      aclLeakage,
      latencyMs: Date.now() - startTime,
      promptTokens: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUSD: null,
      error: null,
    };
  } catch (error) {
    return {
      caseId: evaluationCase.id,
      status: "failed",
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBaseline()
    .then((report) => {
      console.log("\n=== M4 Vector Baseline Report ===");
      console.log(`Version: ${report.version}`);
      console.log(`Evaluation Mode: ${report.evaluationMode}`);
      console.log(`Generated: ${report.generatedAt}`);
      console.log(`Dataset: ${report.datasetVersion}`);
      console.log(`\nTotal cases: ${report.summary.totalCases}`);
      console.log(`Completed: ${report.summary.completedCases}`);
      console.log(`Failed: ${report.summary.failedCases}`);
      console.log(`Skipped: ${report.summary.skippedCases}`);

      if (report.summary.retrievalRecall) {
        console.log(
          `\nRetrieval Recall - Avg: ${report.summary.retrievalRecall.average.toFixed(3)}, P50: ${report.summary.retrievalRecall.p50.toFixed(3)}, P95: ${report.summary.retrievalRecall.p95.toFixed(3)}`,
        );
      }
      if (report.summary.citationCorrectness) {
        console.log(
          `\nCitation Correctness - Avg: ${report.summary.citationCorrectness.average.toFixed(3)}`,
        );
      }
      if (report.summary.latencyMs) {
        console.log(
          `\nLatency - P50: ${report.summary.latencyMs.p50}ms, P95: ${report.summary.latencyMs.p95}ms`,
        );
      }
      if (report.summary.refusalCorrectness) {
        console.log(
          `\nRefusal Correctness: ${report.summary.refusalCorrectness.percentage.toFixed(1)}%`,
        );
      }
      if (report.summary.aclLeakage) {
        console.log(`\nACL Leakage: ${report.summary.aclLeakage.percentage.toFixed(1)}%`);
      }

      console.log(
        "\nBaseline artifact written to evals/reports/m4-vector-offline-baseline-v1.json",
      );
      if (report.summary.failedCases > 0 || report.summary.skippedCases > 0) {
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("Failed to run baseline:", err);
      process.exit(1);
    });
}
