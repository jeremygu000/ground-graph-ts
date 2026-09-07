import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  InMemoryEmbeddingAdapter,
  InMemoryVectorIndex,
} from "../../../src/infrastructure/models/in-memory";
import type { InMemoryVectorIndexEntry } from "../../../src/infrastructure/models/in-memory.types";
import { cosineSimilarity } from "../../../src/infrastructure/models/in-memory";
import { ReciprocalRankFusion } from "../../../src/infrastructure/postgres/fusion";
import { CitationBuilder } from "../../../src/infrastructure/retrieval/citation-builder";
import { DefaultVectorQueryService } from "../../../src/infrastructure/retrieval/vector-query-service";
import { HybridQueryService } from "../../../src/infrastructure/retrieval/hybrid-query-service";
import type {
  VectorQueryService,
  VectorIndexPort,
  EmbeddingPort,
  VectorSearchResultRow,
} from "../../../src/application/models/models.types";
import type { GraphRetrievalPort } from "../../../src/infrastructure/retrieval/graph-retrieval.types";
import type { EntityResolverPort } from "../../../src/application/retrieval/entity-resolver.types";
import { loadCorpus } from "./dataset";
import { computeAverage, computePercentile } from "./metrics";
import { ok } from "./evaluation.utils";
import type { BaselineCaseResult, BaselineSummary, CorpusChunk } from "./evaluation.types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GraphRAGCase {
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
  expectedPaths: Array<{ from: string; predicate: string; to: string }>;
  expectedEvidenceChunkIds: string[];
  maxHops?: number;
}

export interface GraphRAGCaseResult extends BaselineCaseResult {
  hybridRetrievalRecall: number | null;
  vectorOnlyRecall: number | null;
  graphImprovement: number | null;
  pathValidity: boolean | null;
  provenanceComplete: boolean | null;
  strategiesUsed: string[];
  fusionTrace: Array<{ strategy: string; inputs: number; fused: number; weight: number }>;
}

export interface GraphRAGSummary extends BaselineSummary {
  hybridImprovement: {
    relationalAverage: number;
    multiHopAverage: number;
    overallAverage: number;
    passThreshold: boolean;
  } | null;
  pathValidityRate: { percentage: number } | null;
  provenanceCompleteRate: { percentage: number } | null;
}

export interface GraphRAGReport {
  version: string;
  generatedAt: string;
  datasetVersion: string;
  evaluationMode: string;
  embeddingModel: string;
  embeddingDimension: number;
  rerankerModel: string | null;
  generatorModel: string;
  indexVersion: string;
  cases: GraphRAGCaseResult[];
  summary: GraphRAGSummary;
  comparisonDetails: Array<{
    caseId: string;
    type: string;
    vectorOnlyRecall: number | null;
    hybridRecall: number | null;
    improvement: number | null;
    isMultiHop: boolean;
    isRelational: boolean;
  }>;
}

function createInMemoryVectorPort(
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

function createGeneratorStub() {
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

function createVectorService(
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

function createMockGraphPort(): GraphRetrievalPort {
  return {
    async retrieveGraphNeighbors(_entityId, _tenantId, options) {
      const depth = options?.maxDepth ?? 1;
      const neighbors = [
        { id: `neighbor-${depth}-1`, entityId: `entity-${depth + 1}`, score: 1.0 / (1 + depth) },
        { id: `neighbor-${depth}-2`, entityId: `entity-${depth + 2}`, score: 0.8 / (1 + depth) },
      ];
      return ok(neighbors as any[]);
    },
    async retrieveGraphPaths(_startEntityId, _endEntityId, _tenantId, _maxHops) {
      const path = [
        { fromId: "start", predicate: "rel-0", toId: "middle" },
        { fromId: "middle", predicate: "rel-1", toId: "end" },
      ];
      return ok([{ id: "path-1", totalHops: 2, path }] as any[]);
    },
    async retrieveConnectedEntities(_entityId, _depth, _tenantId) {
      return ok([{ id: "connected-1", entityId: "entity-2", score: 0.7, depth: 1 }] as any[]);
    },
  };
}

function createMockEntityResolver(): EntityResolverPort {
  return {
    async resolveEntitiesFromQuery(question, _tenantId) {
      const terms =
        question
          .toLocaleLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((t) => t.length > 3) ?? [];
      const seedEntityIds = terms.slice(0, 3).map((t) => `entity-${t}`);
      return ok({
        entities: seedEntityIds.map((id) => ({
          entityId: id,
          canonicalName: id,
          entityType: "unknown",
          confidence: 0.8,
          mentionText: id,
        })),
        queryPlan: {
          strategy: "hybrid" as const,
          seedEntityIds,
          relatedEntityIds: [],
          budget: { vectorResults: 10, fulltextResults: 10, graphResults: 10 },
          reasoning: "Mock entity resolver for evaluation",
        },
      });
    },
    extractEntityMentions(question) {
      const terms =
        question
          .toLocaleLowerCase()
          .match(/[a-z0-9]+/g)
          ?.filter((t) => t.length > 3) ?? [];
      return terms.map((text, i) => ({
        text,
        start: i * text.length,
        end: i * text.length + text.length,
      }));
    },
  };
}

function createHybridService(
  embedding: EmbeddingPort,
  vector: VectorIndexPort,
  graphPort: GraphRetrievalPort,
): HybridQueryService {
  const entityResolver = createMockEntityResolver();

  return new HybridQueryService({
    vector,
    graph: graphPort,
    embedding,
    fulltext: null,
    reranker: null,
    generator: createGeneratorStub(),
    entityResolver,
    fusion: new ReciprocalRankFusion(),
    config: {
      maxCandidates: 20,
      fusionWeights: { vector: 0.4, graph: 0.4, fulltext: 0.2 },
      maxGraphDepth: 5,
      graphTraversalBudget: 50,
      enableFullText: true,
      enableRerank: false,
      enableGraph: true,
      enableGeneration: false,
      refusalMinCitations: 1,
      refusalMinConfidence: 0.5,
    },
    clock: () => new Date(),
    idGen: () => crypto.randomUUID(),
  });
}

async function runGraphRAGEvaluation(): Promise<GraphRAGReport> {
  const projectRoot = join(__dirname, "..", "..", "..");
  const datasetPath = join(projectRoot, "evals", "datasets", "m6-hybrid-graphrag.json");
  const outputDir = join(projectRoot, "evals", "reports");
  const outputPath = join(outputDir, "m6-hybrid-graphrag-v1.json");

  mkdirSync(outputDir, { recursive: true });

  console.log(`Loading GraphRAG dataset from: ${datasetPath}`);
  const rawDataset = JSON.parse(readFileSync(datasetPath, "utf-8")) as {
    name: string;
    version: string;
    description: string;
    cases: GraphRAGCase[];
  };
  const cases = rawDataset.cases;
  const datasetVersion = rawDataset.version ?? "0.1.0";
  console.log(`Loaded ${cases.length} evaluation cases`);

  console.log("Loading corpus...");
  const corpus = loadCorpus(projectRoot);
  console.log(`Loaded ${corpus.length} corpus chunks`);

  const indexVersionId = "00000000-0000-4000-8000-000000000001";
  const tenantId = "00000000-0000-4000-8000-000000000001";

  const embedding = new InMemoryEmbeddingAdapter("offline-deterministic", 1536);
  const index = new InMemoryVectorIndex();
  const vectorPort = createInMemoryVectorPort(index, corpus, indexVersionId, tenantId, [
    ...new Set(cases.map((c) => c.tenantId)),
  ]);
  const graphPort = createMockGraphPort();
  const vectorService = createVectorService(embedding, vectorPort);
  const hybridService = createHybridService(embedding, vectorPort, graphPort);

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

  const caseResults: GraphRAGCaseResult[] = [];
  const comparisonDetails: GraphRAGReport["comparisonDetails"] = [];

  console.log("\nExecuting GraphRAG evaluation cases...");
  for (let i = 0; i < cases.length; i++) {
    const evaluationCase = cases[i]!;
    const isMultiHop =
      evaluationCase.type.includes("hop") || evaluationCase.type === "path-finding";
    const isRelational =
      evaluationCase.type.includes("impact") || evaluationCase.type.includes("causality");
    const isGraphBeneficial =
      isMultiHop || isRelational || evaluationCase.tags.includes("graph-plus-vector");

    console.log(
      `  [${i + 1}/${cases.length}] Case ${evaluationCase.id}: ${evaluationCase.type} (graph beneficial: ${isGraphBeneficial})`,
    );

    const result = await evaluateGraphRAGCase(evaluationCase, hybridService, vectorService);
    caseResults.push(result);

    comparisonDetails.push({
      caseId: evaluationCase.id,
      type: evaluationCase.type,
      vectorOnlyRecall: result.vectorOnlyRecall,
      hybridRecall: result.hybridRetrievalRecall,
      improvement: result.graphImprovement,
      isMultiHop,
      isRelational,
    });
  }

  const completedResults = caseResults.filter((r) => r.status === "completed");
  const failedResults = caseResults.filter((r) => r.status === "failed");

  const hybridRecalls = completedResults
    .map((r) => r.hybridRetrievalRecall)
    .filter((v): v is number => v !== null);
  const graphImprovements = completedResults
    .map((r) => r.graphImprovement)
    .filter((v): v is number => v !== null);

  const multiHopCases = completedResults.filter((r) => {
    const c = cases.find((c) => c.id === r.caseId);
    return c && (c.type.includes("hop") || c.type === "path-finding");
  });
  const relationalCases = completedResults.filter((r) => {
    const c = cases.find((c) => c.id === r.caseId);
    return c && (c.type.includes("impact") || c.type.includes("causality"));
  });

  const multiHopImprovements = multiHopCases
    .map((r) => r.graphImprovement)
    .filter((v): v is number => v !== null);
  const relationalImprovements = relationalCases
    .map((r) => r.graphImprovement)
    .filter((v): v is number => v !== null);

  const avgMultiHop = multiHopImprovements.length > 0 ? computeAverage(multiHopImprovements) : 0;
  const avgRelational =
    relationalImprovements.length > 0 ? computeAverage(relationalImprovements) : 0;
  const avgOverall = graphImprovements.length > 0 ? computeAverage(graphImprovements) : 0;

  const pathValidityCases = completedResults.filter((r) => r.pathValidity !== null);
  const pathValidityCount = pathValidityCases.filter((r) => r.pathValidity === true).length;

  const provenanceCases = completedResults.filter((r) => r.provenanceComplete !== null);
  const provenanceCount = provenanceCases.filter((r) => r.provenanceComplete === true).length;

  const summary: GraphRAGSummary = {
    totalCases: cases.length,
    completedCases: completedResults.length,
    failedCases: failedResults.length,
    skippedCases: 0,
    retrievalRecall:
      hybridRecalls.length > 0
        ? {
            average: computeAverage(hybridRecalls),
            p50: computePercentile(hybridRecalls, 50),
            p95: computePercentile(hybridRecalls, 95),
          }
        : null,
    answerCorrectness: null,
    citationCorrectness: null,
    refusalCorrectness: null,
    aclLeakage: null,
    latencyMs: null,
    totalCostUSD: null,
    hybridImprovement:
      graphImprovements.length > 0
        ? {
            relationalAverage: avgRelational,
            multiHopAverage: avgMultiHop,
            overallAverage: avgOverall,
            passThreshold: avgMultiHop >= 15 || avgRelational >= 15,
          }
        : null,
    pathValidityRate:
      pathValidityCases.length > 0
        ? { percentage: (pathValidityCount / pathValidityCases.length) * 100 }
        : null,
    provenanceCompleteRate:
      provenanceCases.length > 0
        ? { percentage: (provenanceCount / provenanceCases.length) * 100 }
        : null,
  };

  const report: GraphRAGReport = {
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    datasetVersion,
    evaluationMode: "offline-deterministic-graphrag",
    embeddingModel: "offline-deterministic",
    embeddingDimension: 1536,
    rerankerModel: null,
    generatorModel: "offline-stub",
    indexVersion: indexVersionId,
    cases: caseResults,
    summary,
    comparisonDetails,
  };

  console.log(`\nWriting report to: ${outputPath}`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return report;
}

async function evaluateGraphRAGCase(
  evaluationCase: GraphRAGCase,
  hybridService: HybridQueryService,
  vectorService: VectorQueryService,
): Promise<GraphRAGCaseResult> {
  const startTime = Date.now();

  try {
    const hybridQuery = {
      question: evaluationCase.question,
      tenantId: evaluationCase.tenantId,
      principalId: evaluationCase.principalId,
      strategy: "hybrid" as const,
      maxResults: 10,
      maxHops: evaluationCase.maxHops,
    };

    const vectorQuery = {
      question: evaluationCase.question,
      tenantId: evaluationCase.tenantId,
      principalId: evaluationCase.principalId,
      strategy: "vector" as const,
      maxResults: 10,
    };

    const [hybridResult, vectorResult] = await Promise.all([
      hybridService.query(hybridQuery as Parameters<typeof hybridService.query>[0]),
      vectorService.query(vectorQuery as Parameters<typeof vectorService.query>[0]),
    ]);

    if (!hybridResult.ok || !vectorResult.ok) {
      const hybridError =
        !hybridResult.ok && hybridResult.error instanceof Error ? hybridResult.error.message : "ok";
      const vectorError =
        !vectorResult.ok && vectorResult.error instanceof Error ? vectorResult.error.message : "ok";
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
        error: `Hybrid: ${hybridError}, Vector: ${vectorError}`,
        hybridRetrievalRecall: null,
        vectorOnlyRecall: null,
        graphImprovement: null,
        pathValidity: null,
        provenanceComplete: null,
        strategiesUsed: [],
        fusionTrace: [],
      };
    }

    const hybridRecall = computeRecall(
      evaluationCase.expectedEvidenceChunkIds,
      hybridResult.value.results
        .map((r) => r.chunkId)
        .filter((id): id is string => id !== undefined),
    );
    const vectorRecall = computeRecall(
      evaluationCase.expectedEvidenceChunkIds,
      vectorResult.value.results
        .map((r) => r.chunkId)
        .filter((id): id is string => id !== undefined),
    );
    const improvement =
      hybridRecall !== null && vectorRecall !== null && vectorRecall > 0
        ? ((hybridRecall - vectorRecall) / vectorRecall) * 100
        : hybridRecall !== null && vectorRecall === 0 && hybridRecall > 0
          ? 100
          : null;

    const pathValidity =
      evaluationCase.expectedPaths.length > 0
        ? hybridResult.value.results.some((r) => {
            const meta = r.metadata as Record<string, unknown>;
            return meta && typeof meta.path === "object" && Array.isArray(meta.path);
          })
        : true;

    const provenanceComplete = hybridResult.value.results.every((r) => {
      const meta = r.metadata as Record<string, unknown>;
      return meta && (meta.factId || meta.path || meta.traversalDepth !== undefined);
    });

    return {
      caseId: evaluationCase.id,
      status: "completed",
      retrievalRecall: hybridRecall,
      retrievalHit: hybridRecall !== null && hybridRecall > 0,
      answerCorrectness: null,
      citationCorrectness: null,
      refusalCorrectness: null,
      aclLeakage: null,
      latencyMs: Date.now() - startTime,
      promptTokens: null,
      inputTokens: null,
      outputTokens: null,
      estimatedCostUSD: null,
      error: null,
      hybridRetrievalRecall: hybridRecall,
      vectorOnlyRecall: vectorRecall,
      graphImprovement: improvement,
      pathValidity,
      provenanceComplete,
      strategiesUsed: [evaluationCase.type],
      fusionTrace: hybridResult.value.fusionTrace ?? [],
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
      hybridRetrievalRecall: null,
      vectorOnlyRecall: null,
      graphImprovement: null,
      pathValidity: null,
      provenanceComplete: null,
      strategiesUsed: [],
      fusionTrace: [],
    };
  }
}

function computeRecall(expected: string[], retrieved: string[]): number | null {
  if (expected.length === 0) return null;
  const hits = expected.filter((id) => retrieved.includes(id)).length;
  return hits / expected.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGraphRAGEvaluation()
    .then((report) => {
      console.log("\n=== M6 Hybrid GraphRAG Evaluation Report ===");
      console.log(`Version: ${report.version}`);
      console.log(`Evaluation Mode: ${report.evaluationMode}`);
      console.log(`Generated: ${report.generatedAt}`);
      console.log(`Dataset: ${report.datasetVersion}`);
      console.log(`\nTotal cases: ${report.summary.totalCases}`);
      console.log(`Completed: ${report.summary.completedCases}`);
      console.log(`Failed: ${report.summary.failedCases}`);

      if (report.summary.hybridImprovement) {
        const { relationalAverage, multiHopAverage, overallAverage, passThreshold } =
          report.summary.hybridImprovement;
        console.log(`\nGraphRAG Improvement:`);
        console.log(`  Multi-hop queries: ${multiHopAverage.toFixed(1)}%`);
        console.log(`  Relational queries: ${relationalAverage.toFixed(1)}%`);
        console.log(`  Overall: ${overallAverage.toFixed(1)}%`);
        console.log(`  Passes 15% threshold: ${passThreshold ? "YES" : "NO"}`);
      }

      if (report.summary.pathValidityRate) {
        console.log(`\nPath Validity: ${report.summary.pathValidityRate.percentage.toFixed(1)}%`);
      }

      if (report.summary.provenanceCompleteRate) {
        console.log(
          `\nProvenance Complete: ${report.summary.provenanceCompleteRate.percentage.toFixed(1)}%`,
        );
      }

      console.log("\nReport written to evals/reports/m6-hybrid-graphrag-v1.json");

      if (report.summary.hybridImprovement && !report.summary.hybridImprovement.passThreshold) {
        console.log("\nWARNING: GraphRAG improvement does not meet 15% threshold");
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("Failed to run GraphRAG evaluation:", err);
      process.exit(1);
    });
}
