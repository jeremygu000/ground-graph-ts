import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";
import { HybridQueryService } from "../../src/infrastructure/retrieval/hybrid-query-service";
import { PostgresVectorIndexAdapter } from "../../src/infrastructure/postgres/vector-index";
import { PostgresFullTextSearchAdapter } from "../../src/infrastructure/postgres/fulltext-index";
import { DefaultGraphRetrievalAdapter } from "../../src/infrastructure/retrieval/graph-retrieval-adapter";
import { Neo4jGraphRepository } from "../../src/infrastructure/neo4j/graph-repository";
import { Neo4jClient } from "../../src/infrastructure/neo4j/client";
import { InMemoryEmbeddingAdapter } from "../../src/infrastructure/models/in-memory";
import { ReciprocalRankFusion } from "../../src/infrastructure/postgres/fusion";
import { NoopRerankAdapter } from "../../src/infrastructure/models/rerank-adapter";
import { GenericContainer, Wait } from "testcontainers";
import type { HybridQueryServiceDeps } from "../../src/infrastructure/retrieval/hybrid-query.types";
import type { Neo4jClient as Neo4jClientType } from "../../src/infrastructure/neo4j/client";
import type { GeneratorPort, GenerationResult } from "../../src/application/models/models.types";
import { success } from "../../src/domain/result";

await assertContainerRuntime();

function createMockGenerator(): GeneratorPort {
  return {
    generateStructured: vi.fn().mockResolvedValue(
      success({
        structured: {
          answer: "mock answer",
          status: "answered" as const,
          claims: [],
        },
        model: "mock-model",
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        finishReason: "stop" as const,
        repairAttempts: 0,
      } satisfies GenerationResult),
    ),
    getModel: vi.fn().mockReturnValue("mock-model"),
  };
}

describe("Hybrid Query Service component", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let neo4jContainer: any;
  let neo4jClient: Neo4jClientType;
  const tenantId = crypto.randomUUID();
  const EMBEDDING_DIM = 1536;

  beforeAll(async () => {
    ctx = await startComponentDatabase();

    neo4jContainer = await new GenericContainer("neo4j:5.26-community")
      .withEnvironment({
        NEO4J_AUTH: "neo4j/testpassword",
        NEO4J_PLUGINS: "[]",
        NEO4J_server_memory_heap_initial__size: "256m",
        NEO4J_server_memory_heap_max__size: "256m",
        NEO4J_server_memory_pagecache_size: "128m",
      })
      .withExposedPorts(7687)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(120_000)
      .start();

    neo4jClient = new Neo4jClient({
      uri: `bolt://${neo4jContainer.getHost()}:${neo4jContainer.getMappedPort(7687)}`,
      user: "neo4j",
      password: "testpassword",
      maxConnectionPoolSize: 4,
    });
  }, 180_000);

  afterAll(async () => {
    await ctx?.close();
    await neo4jClient?.close();
    await neo4jContainer?.stop();
  });

  it("verifies Neo4j connectivity", async () => {
    await expect(neo4jClient.verifyConnectivity()).resolves.toBe(true);
  });

  it("constructs HybridQueryService with all dependencies", () => {
    const vectorIndex = new PostgresVectorIndexAdapter(ctx.db);
    const fulltextIndex = new PostgresFullTextSearchAdapter(ctx.db);
    const graphRepo = new Neo4jGraphRepository(neo4jClient);
    const graphAdapter = new DefaultGraphRetrievalAdapter({
      graph: graphRepo,
      clock: () => new Date(),
      idGen: () => crypto.randomUUID(),
    });
    const embedding = new InMemoryEmbeddingAdapter("test-model", EMBEDDING_DIM);
    const fusion = new ReciprocalRankFusion();
    const reranker = new NoopRerankAdapter("noop-reranker");
    const generator = createMockGenerator();

    const deps: HybridQueryServiceDeps = {
      entityResolver: {
        resolveEntitiesFromQuery: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryPlan: {
              strategy: "hybrid" as const,
              seedEntityIds: [],
              relatedEntityIds: [],
              budget: { vectorResults: 10, fulltextResults: 10, graphResults: 10 },
              reasoning: "test",
            },
            entities: [],
          },
        }),
        extractEntityMentions: vi.fn().mockReturnValue([]),
      },
      vector: vectorIndex,
      fulltext: fulltextIndex,
      graph: graphAdapter,
      embedding,
      fusion,
      reranker,
      generator,
      config: {
        enableFullText: true,
        enableGraph: true,
        enableRerank: false,
        enableGeneration: false,
        fusionWeights: { vector: 0.4, fulltext: 0.3, graph: 0.3 },
        maxCandidates: 20,
        maxGraphDepth: 3,
        graphTraversalBudget: 100,
        refusalMinCitations: 1,
        refusalMinConfidence: 0.5,
      },
      clock: () => new Date(),
      idGen: () => crypto.randomUUID(),
    };

    const service = new HybridQueryService(deps);
    expect(service).toBeDefined();
  });

  it("rejects invalid strategy", async () => {
    const vectorIndex = new PostgresVectorIndexAdapter(ctx.db);
    const fulltextIndex = new PostgresFullTextSearchAdapter(ctx.db);
    const graphRepo = new Neo4jGraphRepository(neo4jClient);
    const graphAdapter = new DefaultGraphRetrievalAdapter({
      graph: graphRepo,
      clock: () => new Date(),
      idGen: () => crypto.randomUUID(),
    });
    const embedding = new InMemoryEmbeddingAdapter("test-model", EMBEDDING_DIM);
    const fusion = new ReciprocalRankFusion();
    const reranker = new NoopRerankAdapter("noop-reranker");
    const generator = createMockGenerator();

    const deps: HybridQueryServiceDeps = {
      entityResolver: {
        resolveEntitiesFromQuery: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryPlan: {
              strategy: "hybrid" as const,
              seedEntityIds: [],
              relatedEntityIds: [],
              budget: { vectorResults: 10, fulltextResults: 10, graphResults: 10 },
              reasoning: "test",
            },
            entities: [],
          },
        }),
        extractEntityMentions: vi.fn().mockReturnValue([]),
      },
      vector: vectorIndex,
      fulltext: fulltextIndex,
      graph: graphAdapter,
      embedding,
      fusion,
      reranker,
      generator,
      config: {
        enableFullText: true,
        enableGraph: true,
        enableRerank: false,
        enableGeneration: false,
        fusionWeights: { vector: 0.4, fulltext: 0.3, graph: 0.3 },
        maxCandidates: 20,
        maxGraphDepth: 3,
        graphTraversalBudget: 100,
        refusalMinCitations: 1,
        refusalMinConfidence: 0.5,
      },
      clock: () => new Date(),
      idGen: () => crypto.randomUUID(),
    };

    const service = new HybridQueryService(deps);
    const result = await service.query({
      question: "test question",
      tenantId,
      principalId: crypto.randomUUID(),
      strategy: "vector" as any,
      maxResults: 10,
    });

    expect(result.ok).toBe(false);
  });
});
