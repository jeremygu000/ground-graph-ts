import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  EmbeddingPort,
  VectorIndexPort,
  FullTextSearchPort,
  RerankPort,
  RetrievalFusionPort,
  GeneratorPort,
  VectorSearchResultRow,
} from "@/application/models/models.types";
import type { GraphRetrievalPort } from "@/infrastructure/retrieval/graph-retrieval.types";
import type { EntityResolverPort } from "@/application/retrieval/entity-resolver.types";
import { HybridQueryService } from "@/infrastructure/retrieval/hybrid-query-service";
import type {
  HybridQueryServiceDeps,
  HybridPipelineConfig,
} from "@/infrastructure/retrieval/hybrid-query.types";
import type { RetrievalQuery } from "@/domain/retrieval/retrieval.schema";

describe("HybridQueryService", () => {
  let mockEmbedding: EmbeddingPort;
  let mockVector: VectorIndexPort;
  let mockFulltext: FullTextSearchPort;
  let mockGraph: GraphRetrievalPort;
  let mockReranker: RerankPort;
  let mockFusion: RetrievalFusionPort;
  let mockGenerator: GeneratorPort;
  let mockEntityResolver: EntityResolverPort;
  let config: HybridPipelineConfig;
  let service: HybridQueryService;
  let mockClock: () => Date;
  let mockIdGen: () => string;
  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    mockClock = () => new Date("2024-01-01T00:00:00Z");
    mockIdGen = () => `id-${++callCount}`;

    mockEmbedding = {
      embedBatch: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          embeddings: [{ embedding: new Array(1536).fill(0.1), model: "test" }],
          totalTokens: 10,
          model: "test",
          dimension: 1536,
        },
      }),
      getDimension: vi.fn().mockReturnValue(1536),
      getModel: vi.fn().mockReturnValue("test-model"),
    };

    mockVector = {
      getActiveIndexVersion: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          indexVersionId: "idx-1",
          versionNumber: 1,
          embeddingModel: "test",
          embeddingDimension: 1536,
          isActive: true,
          tenantId: "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
      upsertEmbeddings: vi.fn(),
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            chunkId: "chunk-1",
            documentVersionId: "docver-1",
            documentId: "doc-1",
            content: "test content",
            locator: {},
            metadata: {},
            score: 0.9,
            indexVersionId: "idx-1",
            embeddingModel: "",
          },
        ] as VectorSearchResultRow[],
      }),
      deleteByDocumentVersion: vi.fn(),
    };

    mockFulltext = {
      search: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            chunkId: "chunk-2",
            documentVersionId: "docver-2",
            documentId: "doc-2",
            content: "fulltext content",
            locator: {},
            metadata: {},
            score: 0.8,
            rank: 10,
            headline: "fulltext <b>content</b>",
          },
        ],
      }),
      rebuildIndex: vi.fn(),
    };

    mockGraph = {
      retrieveGraphNeighbors: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            id: "result-1",
            chunkId: "chunk-3",
            documentVersionId: "docver-3",
            documentId: "doc-3",
            content: "graph content",
            score: 0.7,
            metadata: {},
          },
        ],
      }),
      retrieveGraphPaths: vi.fn(),
      retrieveConnectedEntities: vi.fn(),
    };

    mockReranker = {
      rerank: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            id: "result-1",
            chunkId: "chunk-1",
            documentVersionId: "docver-1",
            documentId: "doc-1",
            content: "test content",
            score: 0.95,
            metadata: {},
          },
        ],
      }),
      getModel: vi.fn().mockReturnValue("test-reranker"),
    };

    mockFusion = {
      fuse: vi.fn().mockResolvedValue({
        ok: true,
        value: [
          {
            id: "result-1",
            chunkId: "chunk-1",
            documentVersionId: "docver-1",
            documentId: "doc-1",
            content: "test content",
            score: 0.9,
            metadata: {},
            strategy: "vector",
          },
        ],
      }),
    };

    mockGenerator = {
      generateStructured: vi.fn(),
      getModel: vi.fn().mockReturnValue("test-generator"),
    };

    mockEntityResolver = {
      resolveEntitiesFromQuery: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          entities: [
            {
              entityId: "entity-1",
              canonicalName: "UserService",
              entityType: "service",
              confidence: 0.9,
              mentionText: "UserService",
            },
          ],
          queryPlan: {
            strategy: "hybrid" as const,
            seedEntityIds: ["entity-1"],
            relatedEntityIds: [],
            budget: { vectorResults: 20, fulltextResults: 10, graphResults: 10 },
            reasoning: "test",
          },
        },
      }),
      extractEntityMentions: vi.fn().mockReturnValue([{ text: "UserService", start: 0, end: 11 }]),
    };

    config = {
      maxCandidates: 20,
      enableFullText: true,
      enableRerank: true,
      enableGeneration: false,
      enableGraph: true,
      fusionWeights: { vector: 0.4, fulltext: 0.3, graph: 0.3 },
      refusalMinCitations: 3,
      refusalMinConfidence: 0.7,
      maxGraphDepth: 3,
      graphTraversalBudget: 50,
    };

    const deps: HybridQueryServiceDeps = {
      embedding: mockEmbedding,
      vector: mockVector,
      fulltext: mockFulltext,
      graph: mockGraph,
      reranker: mockReranker,
      fusion: mockFusion,
      generator: mockGenerator,
      entityResolver: mockEntityResolver,
      config,
      clock: mockClock,
      idGen: mockIdGen,
    };

    service = new HybridQueryService(deps);
  });

  describe("query", () => {
    it("accepts vector strategy for vector-only retrieval", async () => {
      const query: RetrievalQuery = {
        question: "test question",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "vector",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("accepts fulltext strategy for fulltext-only retrieval", async () => {
      const query: RetrievalQuery = {
        question: "test question",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "fulltext",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("executes hybrid query successfully", async () => {
      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 10,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.entityResolution).not.toBeNull();
    });

    it("handles graph retrieval", async () => {
      const query: RetrievalQuery = {
        question: "How does UserService depend on other services?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "graph",
        maxHops: 2,
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles missing fulltext gracefully", async () => {
      const depsWithoutFulltext: HybridQueryServiceDeps = {
        ...service["deps"],
        fulltext: null,
        config: { ...config, enableFullText: false },
      };
      const svcWithoutFulltext = new HybridQueryService(depsWithoutFulltext);

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await svcWithoutFulltext.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles missing graph gracefully", async () => {
      const depsWithoutGraph: HybridQueryServiceDeps = {
        ...service["deps"],
        graph: null,
        config: { ...config, enableGraph: false },
      };
      const svcWithoutGraph = new HybridQueryService(depsWithoutGraph);

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await svcWithoutGraph.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles missing reranker gracefully", async () => {
      const depsWithoutReranker: HybridQueryServiceDeps = {
        ...service["deps"],
        reranker: null,
        config: { ...config, enableRerank: false },
      };
      const svcWithoutReranker = new HybridQueryService(depsWithoutReranker);

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await svcWithoutReranker.query(query);

      expect(result.ok).toBe(true);
    });

    it("returns failure when entity resolution fails", async () => {
      vi.mocked(mockEntityResolver.resolveEntitiesFromQuery).mockResolvedValueOnce({
        ok: false,
        error: new Error("Entity resolution failed"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(false);
    });

    it("returns failure when embedding fails", async () => {
      vi.mocked(mockEmbedding.embedBatch).mockResolvedValueOnce({
        ok: false,
        error: new Error("Embedding failed"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(false);
    });

    it("returns failure when vector search fails", async () => {
      vi.mocked(mockVector.search).mockResolvedValueOnce({
        ok: false,
        error: new Error("Vector search failed"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(false);
    });

    it("returns failure when the active index lookup fails", async () => {
      vi.mocked(mockVector.getActiveIndexVersion).mockResolvedValueOnce({
        ok: false,
        error: new Error("Index lookup failed"),
      });
      const result = await service.query({
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      });
      expect(result).toMatchObject({ ok: false, error: { message: "Index lookup failed" } });
    });

    it("returns failure when the query embedding is missing", async () => {
      vi.mocked(mockEmbedding.embedBatch).mockResolvedValueOnce({
        ok: true,
        value: { embeddings: [], totalTokens: 0, model: "test", dimension: 1536 },
      });
      const result = await service.query({
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      });
      expect(result).toMatchObject({
        ok: false,
        error: { message: "Embedding result missing for question" },
      });
    });
  });

  describe("executeGraphRetrieval", () => {
    it("returns no graph results when the graph adapter is absent", async () => {
      const noGraphService = new HybridQueryService({
        ...service["deps"],
        graph: null,
      });
      const executeGraphRetrieval = noGraphService["executeGraphRetrieval"];
      const result = await executeGraphRetrieval.call(
        noGraphService,
        {
          entities: [],
          queryPlan: {
            strategy: "graph",
            seedEntityIds: ["entity-1"],
            relatedEntityIds: [],
            budget: { vectorResults: 1, fulltextResults: 1, graphResults: 1 },
            reasoning: "test",
          },
        },
        {
          question: "test",
          tenantId: "tenant",
          principalId: "principal",
          strategy: "graph",
          maxResults: 5,
        },
      );
      expect(result).toEqual({ ok: true, value: [] });
    });

    it("returns empty when no seed entities", async () => {
      vi.mocked(mockEntityResolver.resolveEntitiesFromQuery).mockResolvedValueOnce({
        ok: true,
        value: {
          entities: [],
          queryPlan: {
            strategy: "hybrid" as const,
            seedEntityIds: [],
            relatedEntityIds: [],
            budget: { vectorResults: 20, fulltextResults: 10, graphResults: 10 },
            reasoning: "test",
          },
        },
      });

      const query: RetrievalQuery = {
        question: "test",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "graph",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles graph retrieval errors gracefully", async () => {
      vi.mocked(mockGraph.retrieveGraphNeighbors).mockResolvedValueOnce({
        ok: false,
        error: new Error("Graph error"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService depend on other services?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "graph",
        maxHops: 2,
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("respects graph traversal budget", async () => {
      const lowBudgetConfig = { ...config, graphTraversalBudget: 1 };
      const lowBudgetService = new HybridQueryService({
        ...service["deps"],
        config: lowBudgetConfig,
      });

      const query: RetrievalQuery = {
        question: "How does ServiceA and ServiceB and ServiceC relate?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "graph",
        maxHops: 2,
        maxResults: 20,
      };

      const result = await lowBudgetService.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles query with timeRange filter", async () => {
      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "graph",
        maxHops: 2,
        maxResults: 20,
        filters: {
          timeRange: {
            validFrom: "2024-01-01T00:00:00Z",
          },
        },
      };

      const result = await service.query(query);

      expect(result.ok).toBe(true);
    });

    it("handles fulltext search errors gracefully", async () => {
      vi.mocked(mockFulltext.search).mockResolvedValueOnce({
        ok: false,
        error: new Error("Fulltext error"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(false);
    });

    it("handles fusion errors gracefully", async () => {
      vi.mocked(mockFusion.fuse).mockResolvedValueOnce({
        ok: false,
        error: new Error("Fusion error"),
      });

      const query: RetrievalQuery = {
        question: "How does UserService work?",
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        principalId: "550e8400-e29b-41d4-a716-446655440001",
        strategy: "hybrid",
        maxResults: 20,
      };

      const result = await service.query(query);

      expect(result.ok).toBe(false);
    });
  });
});
