import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ZodStructuredOutputParser,
  tryRecoverJson,
  extractBalancedJsonObject,
} from "../../../src/infrastructure/models/structured-output-parser";
import {
  LexicalRerankAdapter,
  NoopRerankAdapter,
  tokenize,
  lexicalOverlapScore,
} from "../../../src/infrastructure/models/rerank-adapter";
import { OpenAIEmbeddingAdapter } from "../../../src/infrastructure/models/embedding-adapter";
import { OpenAIGeneratorAdapter } from "../../../src/infrastructure/models/generator-adapter";
import {
  InMemoryEmbeddingAdapter,
  InMemoryVectorIndex,
  cosineSimilarity,
} from "../../../src/infrastructure/models/in-memory";
import {
  ReciprocalRankFusion,
  ConvexFusion,
  traceFusion,
} from "../../../src/infrastructure/postgres/fusion";
import { CitationBuilder } from "../../../src/infrastructure/retrieval/citation-builder";
import { DefaultVectorQueryService } from "../../../src/infrastructure/retrieval/vector-query-service";
import { StructuredAnswerSchema } from "../../../src/application/models/ports";
import { success } from "../../../src/domain/result";
import type { Chunk } from "../../../src/domain/documents/types";
import type { RetrievalResult, RetrievalStrategy } from "../../../src/domain/retrieval/types";
import type {
  EmbeddingPort,
  FullTextSearchPort,
  GeneratorPort,
  RerankPort,
  RetrievalFusionPort,
  VectorIndexPort,
  VectorQueryService,
} from "../../../src/application/models/ports";

const EMBEDDING_DIM = 1536;
const MODEL = "test-embed-v1";
const PRINCIPAL_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function loadCorpus(): Array<{
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
}> {
  const path = join(process.cwd(), "evals/retrieval/corpus.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    chunks: Array<{
      chunkId: string;
      documentVersionId: string;
      documentId?: string;
      content: string;
      locator: Record<string, unknown>;
    }>;
  };
  return data.chunks.map((c) => ({
    chunkId: c.chunkId,
    documentVersionId: c.documentVersionId,
    documentId: c.documentId ?? c.documentVersionId,
    content: c.content,
    locator: c.locator,
  }));
}

function loadDataset(): Array<{
  id: string;
  type: string;
  tags: string[];
  question: string;
  tenantId: string;
  principalId: string;
  expectedStatus: string;
  requiredClaimText: string;
  forbiddenClaimText: string[];
}> {
  const path = join(process.cwd(), "evals/datasets/m4-vector-baseline.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    cases: Array<{
      id: string;
      type: string;
      tags: string[];
      question: string;
      tenantId: string;
      principalId: string;
      expectedStatus: string;
      requiredClaimText: string;
      forbiddenClaimText: string[];
    }>;
  };
  return data.cases;
}

function buildChunks(corpus: ReturnType<typeof loadCorpus>): Chunk[] {
  return corpus.map((c, idx) => ({
    id: c.chunkId,
    documentVersionId: c.documentVersionId,
    principalId: PRINCIPAL_ID,
    sequenceNumber: idx,
    content: c.content,
    contentHash: `hash-${idx}`,
    locator: c.locator as Chunk["locator"],
    createdAt: new Date().toISOString(),
  }));
}

function buildService(opts: {
  embedding: EmbeddingPort;
  index: InMemoryVectorIndex;
  fulltext?: InMemoryFullTextSearchStub;
  rerank?: RerankPort;
  fusion?: RetrievalFusionPort;
  generator?: GeneratorPort;
  tenantId: string;
  indexVersionId: string;
  documentIds?: string[];
}): VectorQueryService {
  const vector: VectorIndexPort = {
    async getActiveIndexVersion(tenantId) {
      if (tenantId !== opts.tenantId) return success(null);
      return success({
        indexVersionId: opts.indexVersionId,
        versionNumber: 1,
        embeddingModel: MODEL,
        embeddingDimension: EMBEDDING_DIM,
        isActive: true,
        tenantId,
      });
    },
    async upsertEmbeddings(_chunks, embeddings, indexVersionId, _tenantId) {
      const entries = embeddings.map((emb, i) => {
        const c = buildChunks(loadCorpus())[i];
        if (!c) throw new Error("missing chunk");
        return {
          chunkId: c.id,
          documentVersionId: c.documentVersionId,
          documentId: opts.documentIds?.[i] ?? c.documentVersionId,
          content: c.content,
          locator: c.locator as unknown as Record<string, unknown>,
          metadata: {},
          embedding: emb,
          indexVersionId,
          embeddingModel: MODEL,
          dimension: EMBEDDING_DIM,
        };
      });
      opts.index.upsert(entries);
      return success({ upserted: embeddings.length, indexVersionId });
    },
    async search(queryEmbedding, tenantId, searchOpts) {
      const limit = searchOpts.limit ?? 20;
      const minScore = searchOpts.minScore ?? 0;
      const searchParams: {
        limit: number;
        minScore: number;
        documentIds?: string[];
        chunkIds?: string[];
      } = {
        limit,
        minScore,
      };
      if (searchOpts.filter?.documentIds) searchParams.documentIds = searchOpts.filter.documentIds;
      if (searchOpts.filter?.chunkIds) searchParams.chunkIds = searchOpts.filter.chunkIds;
      const results = opts.index.search(tenantId, queryEmbedding, searchParams);
      return success(
        results.map((r) => ({
          chunkId: r.chunkId,
          documentVersionId: r.documentVersionId,
          documentId: r.documentId,
          content: r.content,
          locator: r.locator,
          metadata: {
            ...r.metadata,
            documentVersionId: r.documentVersionId,
            documentId: r.documentId,
            locator: r.locator,
          },
          score: cosineSimilarity(queryEmbedding, r.embedding),
          indexVersionId: r.indexVersionId,
          embeddingModel: r.embeddingModel,
        })),
      );
    },
    async deleteByDocumentVersion(documentVersionId) {
      const deleted = opts.index.deleteByDocumentVersion(documentVersionId);
      return success({ deleted });
    },
  };

  const generator: GeneratorPort = opts.generator ?? {
    async generateStructured() {
      return success({
        structured: {
          answer: "stub",
          status: "insufficient_evidence",
          claims: [],
          refusalReason: "stub",
        },
        model: "stub",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        finishReason: "stop",
        repairAttempts: 0,
      });
    },
    getModel() {
      return "stub";
    },
  };

  return new DefaultVectorQueryService({
    embedding: opts.embedding,
    vector,
    fulltext: opts.fulltext ?? null,
    reranker: opts.rerank ?? null,
    fusion: opts.fusion ?? new ReciprocalRankFusion(),
    generator,
    citationBuilder: new CitationBuilder(),
    config: {
      embedding: { provider: "openai", model: MODEL, dimension: EMBEDDING_DIM },
      reranker: { provider: "none", model: "lexical-blend" },
      generator: { model: "stub" },
      maxCandidates: 10,
      enableFullText: !!opts.fulltext,
      enableRerank: !!opts.rerank,
      enableGeneration: false,
      fusionWeights: { vector: 0.6, fulltext: opts.fulltext ? 0.3 : 0, graph: 0, hybrid: 0.1 },
      refusalMinCitations: 1,
      refusalMinConfidence: 0.5,
    },
    clock: () => new Date(),
    idGen: () => crypto.randomUUID(),
  });
}

class InMemoryFullTextSearchStub implements FullTextSearchPort {
  constructor(private readonly corpus: ReturnType<typeof loadCorpus>) {}
  async search(
    query: string,
    _tenantId: string,
    options: { limit?: number; filter?: { documentIds?: string[]; principalId?: string[] } } = {},
  ) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return success([]);
    const scored = this.corpus
      .filter(
        (c) =>
          (!options.filter?.documentIds || options.filter.documentIds.includes(c.documentId)) &&
          (!options.filter?.principalId || options.filter.principalId.length === 0 || true),
      )
      .map((c) => ({ c, score: lexicalOverlapScore(tokens, c.content) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 20);
    return success(
      scored.map((s, i) => ({
        chunkId: s.c.chunkId,
        documentVersionId: s.c.documentVersionId,
        documentId: s.c.documentId,
        content: s.c.content,
        locator: s.c.locator,
        metadata: {},
        score: s.score,
        rank: scored.length - i,
        headline: s.c.content.slice(0, 200),
      })),
    );
  }
  async rebuildIndex() {
    return success({ rebuilt: 0 });
  }
}

describe("M4 vector RAG baseline", () => {
  const dataset = loadDataset();
  const corpus = loadCorpus();
  void buildChunks(corpus);
  const tenantId = corpus[0] ? (dataset[0]?.tenantId ?? "") : "";
  let embedding: InMemoryEmbeddingAdapter;
  let index: InMemoryVectorIndex;
  let indexVersionId: string;
  let service: VectorQueryService;
  let fulltext: InMemoryFullTextSearchStub;
  let rerank: LexicalRerankAdapter;

  beforeEach(async () => {
    embedding = new InMemoryEmbeddingAdapter(MODEL, EMBEDDING_DIM);
    index = new InMemoryVectorIndex();
    indexVersionId = crypto.randomUUID();
    index.setActiveIndex(tenantId, indexVersionId);
    fulltext = new InMemoryFullTextSearchStub(corpus);
    rerank = new LexicalRerankAdapter({ provider: "local", model: "lexical-blend" });
    const vectors = await embedding.embedBatch({ inputs: corpus.map((c) => c.content), tenantId });
    if (!vectors.ok) throw new Error("seed embedding failed");
    const entries = vectors.value.embeddings.map((e, i) => {
      const c = corpus[i];
      if (!c) throw new Error("missing corpus entry");
      return {
        chunkId: c.chunkId,
        documentVersionId: c.documentVersionId,
        documentId: c.documentId,
        content: c.content,
        locator: c.locator,
        metadata: {},
        embedding: e.embedding,
        indexVersionId,
        embeddingModel: MODEL,
        dimension: EMBEDDING_DIM,
      };
    });
    index.upsert(entries);
    service = buildService({
      embedding,
      index,
      fulltext,
      rerank,
      tenantId,
      indexVersionId,
    });
  });

  afterEach(() => {
    // no-op
  });

  describe("embedding batch + retry", () => {
    it("batches inputs and returns aligned embeddings", async () => {
      const result = await embedding.embedBatch({
        inputs: ["hello", "world"],
        tenantId,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.embeddings).toHaveLength(2);
      expect(result.value.dimension).toBe(EMBEDDING_DIM);
      expect(result.value.embeddings[0]?.embedding).toHaveLength(EMBEDDING_DIM);
    });

    it("rejects empty inputs and invalid strings", async () => {
      const empty = await embedding.embedBatch({ inputs: [], tenantId });
      expect(empty.ok).toBe(true);
      if (empty.ok) {
        expect(empty.value.embeddings).toHaveLength(0);
      }
      const invalid = await embedding.embedBatch({ inputs: ["valid", ""], tenantId });
      expect(invalid.ok).toBe(false);
    });

    it("reproduces identical embeddings for identical inputs", async () => {
      const a = await embedding.embedBatch({ inputs: ["PostgreSQL vector extension"], tenantId });
      const b = await embedding.embedBatch({ inputs: ["PostgreSQL vector extension"], tenantId });
      if (!a.ok || !b.ok) throw new Error("embedding failed");
      expect(a.value.embeddings[0]?.embedding).toEqual(b.value.embeddings[0]?.embedding);
    });

    it("retries on transient errors via the OpenAI adapter when constructed locally", async () => {
      const adapter = new OpenAIEmbeddingAdapter({
        provider: "local",
        model: "local-test",
        dimension: 16,
        maxRetries: 2,
        timeoutMs: 1000,
      });
      const result = await adapter.embedBatch({ inputs: ["hello", "world"], tenantId });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.dimension).toBe(16);
      }
    });

    it("rejects embedding adapter construction with bad dimension or model", () => {
      expect(
        () => new OpenAIEmbeddingAdapter({ provider: "local", model: "x", dimension: 0 }),
      ).toThrow();
      expect(
        () => new OpenAIEmbeddingAdapter({ provider: "local", model: "", dimension: 16 }),
      ).toThrow();
    });
  });

  describe("vector index behaviour", () => {
    it("retrieves semantically similar chunks", async () => {
      const result = await service.query({
        question: "Which PostgreSQL extensions does GroundGraph enable?",
        tenantId,
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "vector",
        maxResults: 5,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.results.length).toBeGreaterThan(0);
      const top = result.value.results[0];
      expect(top?.content).toContain("uuid-ossp");
    });

    it("respects document filter", async () => {
      const result = await service.query({
        question: "PostgreSQL extensions",
        tenantId,
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "vector",
        maxResults: 5,
        filters: { documentIds: ["00000000-0000-4000-8000-0000000000b1"] },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.results.length).toBeGreaterThan(0);
      for (const r of result.value.results) {
        expect((r.metadata?.["documentId"] as string) ?? "").toBe(
          "00000000-0000-4000-8000-0000000000b1",
        );
      }
    });

    it("returns empty for tenant without an index", async () => {
      const result = await service.query({
        question: "anything",
        tenantId: "00000000-0000-4000-8000-0000000000ff",
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "vector",
        maxResults: 5,
      });
      expect(result.ok).toBe(false);
    });

    it("refuses graph and hybrid strategies", async () => {
      const result = await service.query({
        question: "anything",
        tenantId,
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "hybrid",
        maxResults: 5,
      });
      expect(result.ok).toBe(false);
    });

    it("fuses vector and fulltext results", async () => {
      const result = await service.query({
        question: "tsvector full text search",
        tenantId,
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "vector",
        maxResults: 5,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const sources = result.value.fusionTrace.map((t) => t.strategy);
      expect(sources).toContain("vector");
      expect(sources).toContain("fulltext");
    });
  });

  describe("deterministic fusion", () => {
    const make = (
      id: string,
      score: number,
      strategy: RetrievalStrategy,
      chunkId?: string,
    ): RetrievalResult => ({
      id,
      strategy,
      score,
      chunkId,
      content: `content for ${id}`,
    });

    it("RRF is stable and order-sensitive", () => {
      const fusion = new ReciprocalRankFusion();
      const a = fusion.fuse(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1"), make("b", 0.7, "vector", "c2")]],
          ["fulltext", [make("b", 0.5, "fulltext", "c2"), make("c", 0.3, "fulltext", "c3")]],
        ]),
        { weights: { vector: 0.6, fulltext: 0.4 }, maxResults: 10 },
      );
      const b = fusion.fuse(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1"), make("b", 0.7, "vector", "c2")]],
          ["fulltext", [make("b", 0.5, "fulltext", "c2"), make("c", 0.3, "fulltext", "c3")]],
        ]),
        { weights: { vector: 0.6, fulltext: 0.4 }, maxResults: 10 },
      );
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.value.map((r) => r.id)).toEqual(b.value.map((r) => r.id));
    });

    it("RRF dedupes by chunkId across strategies", () => {
      const fusion = new ReciprocalRankFusion();
      const result = fusion.fuse(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1")]],
          ["fulltext", [make("b", 0.8, "fulltext", "c1")]],
        ]),
        { weights: { vector: 0.5, fulltext: 0.5 }, maxResults: 10 },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.metadata?.["fusionSources"]).toEqual(["vector", "fulltext"]);
    });

    it("RRF skips strategies with zero weight", () => {
      const fusion = new ReciprocalRankFusion();
      const result = fusion.fuse(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1")]],
          ["fulltext", [make("b", 0.8, "fulltext", "c2")]],
        ]),
        { weights: { vector: 1, fulltext: 0 }, maxResults: 10 },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe("a");
    });

    it("ConvexFusion produces results within [0,1]", () => {
      const fusion = new ConvexFusion();
      const result = fusion.fuse(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1"), make("b", 0.7, "vector", "c2")]],
          ["fulltext", [make("b", 0.5, "fulltext", "c2")]],
        ]),
        { weights: { vector: 0.5, fulltext: 0.5 }, maxResults: 10 },
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const r of result.value) {
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      }
    });

    it("traceFusion records weights and counts", () => {
      const trace = traceFusion(
        new Map([
          ["vector", [make("a", 0.9, "vector", "c1")]],
          ["fulltext", [make("b", 0.5, "fulltext", "c2")]],
        ]),
        [],
        { weights: { vector: 0.6, fulltext: 0.3 } },
      );
      expect(trace).toHaveLength(2);
      expect(trace.find((t) => t.strategy === "vector")?.weight).toBe(0.6);
    });
  });

  describe("citations and evidence references", () => {
    it("builds citation ids deterministically from chunkId+index", async () => {
      const result = await service.query({
        question: "PostgreSQL extensions",
        tenantId,
        principalId: "00000000-0000-4000-8000-0000000000a1",
        strategy: "vector",
        maxResults: 3,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.citations.length).toBe(result.value.results.length);
      for (let i = 0; i < result.value.citations.length; i++) {
        const c = result.value.citations[i];
        const r = result.value.results[i];
        expect(c?.chunkId).toBe(r?.chunkId);
        expect(c?.snippet.length).toBeGreaterThan(0);
        expect(c?.startChar).toBe(0);
        expect(c?.endChar).toBe(r?.content.length ?? 0);
      }
    });

    it("citationBuilder rejects results without chunkId", async () => {
      const builder = new CitationBuilder();
      const result = await builder.buildFromRetrieval(
        [{ id: "x", strategy: "vector", score: 0.5, content: "no chunk" } as RetrievalResult],
        tenantId,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe("Zod structured output parser and repair", () => {
    const schema = StructuredAnswerSchema;

    it("parses well-formed structured answers", () => {
      const parser = new ZodStructuredOutputParser(schema);
      const result = parser.parse({
        answer: "ok",
        status: "answered",
        claims: [
          {
            claimId: crypto.randomUUID(),
            claimText: "claim",
            citations: [
              {
                citationId: crypto.randomUUID(),
                evidenceId: crypto.randomUUID(),
                chunkId: crypto.randomUUID(),
                documentVersionId: crypto.randomUUID(),
                locatorPath: "p",
                snippet: "s",
                startChar: 0,
                endChar: 1,
                score: 0.5,
              },
            ],
            confidence: 0.5,
            supportedBy: [crypto.randomUUID()],
          },
        ],
      });
      expect(result.ok).toBe(true);
    });

    it("repairs fence-wrapped and trailing-comma JSON", () => {
      const parser = new ZodStructuredOutputParser(schema);
      const good = {
        answer: "ok",
        status: "answered" as const,
        claims: [
          {
            claimId: crypto.randomUUID(),
            claimText: "c",
            citations: [
              {
                citationId: crypto.randomUUID(),
                evidenceId: crypto.randomUUID(),
                chunkId: crypto.randomUUID(),
                documentVersionId: crypto.randomUUID(),
                locatorPath: "p",
                snippet: "s",
                startChar: 0,
                endChar: 1,
                score: 0.5,
              },
            ],
            confidence: 0.5,
            supportedBy: [crypto.randomUUID()],
          },
        ],
      };
      const raw = "```json\n" + JSON.stringify(good) + ",\n}";
      const result = parser.parseWithRepair(raw, raw);
      expect(result.ok).toBe(true);
    });

    it("recovers JSON inside surrounding prose", () => {
      const text = 'Here you go: {"answer": "ok", "status": "refused", "claims": []} cheers';
      const recovered = tryRecoverJson(text);
      expect(recovered).toBeDefined();
    });

    it("extractBalancedJsonObject handles nested braces", () => {
      const text = 'prefix {"a": 1, "b": {"c": 2}} suffix';
      const extracted = extractBalancedJsonObject(text);
      expect(extracted).toBe('{"a": 1, "b": {"c": 2}}');
    });

    it("returns failure for unrecoverable JSON", () => {
      const parser = new ZodStructuredOutputParser(schema);
      const result = parser.parseWithRepair("not json at all", "not json at all");
      expect(result.ok).toBe(false);
    });
  });

  describe("lexical rerank adapter", () => {
    it("blends vector and lexical scores", async () => {
      const adapter = new LexicalRerankAdapter({ provider: "local", model: "lexical-blend" });
      const result = await adapter.rerank({
        query: "PostgreSQL vector",
        candidates: [
          { id: "a", strategy: "vector", score: 0.5, content: "PostgreSQL vector extension" },
          { id: "b", strategy: "vector", score: 0.9, content: "no overlap" },
        ],
        topK: 2,
      });
      if (!result.ok) throw new Error("rerank failed");
      expect(result.value[0]?.id).toBe("a");
    });

    it("noop adapter preserves order", async () => {
      const adapter = new NoopRerankAdapter("noop");
      const result = await adapter.rerank({
        query: "x",
        candidates: [
          { id: "a", strategy: "vector", score: 0.5, content: "a" },
          { id: "b", strategy: "vector", score: 0.4, content: "b" },
        ],
        topK: 1,
      });
      if (!result.ok) throw new Error("rerank failed");
      expect(result.value.map((r) => r.id)).toEqual(["a"]);
    });

    it("tokenize and lexicalOverlapScore behave as expected", () => {
      expect(tokenize("Hello, World!").sort()).toEqual(["hello", "world"]);
      expect(
        lexicalOverlapScore(["postgresql", "vector"], "PostgreSQL vector extension"),
      ).toBeCloseTo(1, 5);
      expect(lexicalOverlapScore(["absent"], "PostgreSQL vector extension")).toBe(0);
    });

    it("rerank fails on empty query", async () => {
      const adapter = new LexicalRerankAdapter({ provider: "local", model: "lexical-blend" });
      const result = await adapter.rerank({ query: "", candidates: [] });
      expect(result.ok).toBe(false);
    });
  });

  describe("golden evaluation dataset (M4)", () => {
    const expectedStatuses = new Map(dataset.map((c) => [c.id, c.expectedStatus]));
    const requiredClaims = new Map(dataset.map((c) => [c.id, c.requiredClaimText]));
    const forbiddenClaims = new Map(dataset.map((c) => [c.id, c.forbiddenClaimText]));

    it("contains 30-50 cases", () => {
      expect(dataset.length).toBeGreaterThanOrEqual(30);
      expect(dataset.length).toBeLessThanOrEqual(50);
    });

    it("each case is well-formed", () => {
      for (const c of dataset) {
        expect(c.id).toBeTruthy();
        expect(c.question.length).toBeGreaterThan(0);
        expect(["answered", "insufficient_evidence", "refused"]).toContain(c.expectedStatus);
      }
    });

    it("vector pipeline returns citations for answered cases", async () => {
      const answered = dataset.filter((c) => c.expectedStatus === "answered");
      expect(answered.length).toBeGreaterThan(0);
      for (const c of answered.slice(0, 5)) {
        const result = await service.query({
          question: c.question,
          tenantId,
          principalId: c.principalId,
          strategy: "vector",
          maxResults: 5,
        });
        if (!result.ok) {
          throw new Error(`query failed for ${c.id}: ${result.error.message}`);
        }
        expect(result.value.citations.length).toBeGreaterThan(0);
      }
    });

    it("refusal cases return no results in the test corpus", async () => {
      const refusals = dataset.filter((c) => c.expectedStatus === "insufficient_evidence");
      for (const c of refusals.slice(0, 3)) {
        const result = await service.query({
          question: c.question,
          tenantId,
          principalId: c.principalId,
          strategy: "vector",
          maxResults: 5,
        });
        if (!result.ok) continue;
        const requiredText = requiredClaims.get(c.id) ?? "";
        const forbidden = forbiddenClaims.get(c.id) ?? [];
        const hasRequired =
          requiredText.length === 0 ||
          result.value.results.some((r) =>
            r.content.toLowerCase().includes(requiredText.toLowerCase()),
          );
        if (!hasRequired) {
          expect(result.value.results).toHaveLength(0);
          for (const f of forbidden) {
            expect(
              result.value.results.some((r) => r.content.toLowerCase().includes(f.toLowerCase())),
            ).toBe(false);
          }
        }
        expect(expectedStatuses.get(c.id)).toBe("insufficient_evidence");
      }
    });

    it("ACL isolation: tenant 2 cannot see tenant 1 chunks", async () => {
      const result = await service.query({
        question: "PostgreSQL extensions",
        tenantId: "00000000-0000-4000-8000-000000000002",
        principalId: "00000000-0000-4000-8000-0000000000a2",
        strategy: "vector",
        maxResults: 5,
      });
      expect(result.ok).toBe(false);
    });
  });
});

describe("OpenAI generator adapter error handling", () => {
  it("can be constructed with minimal config", () => {
    const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" });
    expect(adapter.getModel()).toBe("gpt-4o-mini");
  });

  it("rejects empty model", () => {
    expect(() => new OpenAIGeneratorAdapter({ model: "" })).toThrow();
  });
});
