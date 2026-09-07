import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import { serializerCompiler, validatorCompiler } from "@fastify/type-provider-zod";
import type { HealthChecker } from "@/application/health.types";
import {
  PostgresHealthChecker,
  Neo4jHealthChecker,
  MinioHealthChecker,
} from "@/infrastructure/health";
import { Database, setGlobalDatabase } from "@/infrastructure/postgres/client";
import { Neo4jClient } from "@/infrastructure/neo4j/client";
import { ObjectStorageClient } from "@/infrastructure/object-storage/client";
import { initTelemetry, shutdownTelemetry, NoopTracer } from "@/infrastructure/telemetry";
import { DefaultUnitOfWorkFactory } from "@/infrastructure/unit-of-work";
import { Neo4jGraphRepository } from "@/infrastructure/neo4j/graph-repository";
import { DefaultGraphRetrievalAdapter } from "@/infrastructure/retrieval/graph-retrieval-adapter";
import { HybridQueryService } from "@/infrastructure/retrieval/hybrid-query-service";
import { OpenAIEmbeddingAdapter } from "@/infrastructure/models/embedding-adapter";
import { OpenAIGeneratorAdapter } from "@/infrastructure/models/generator-adapter";
import { NoopRerankAdapter } from "@/infrastructure/models/rerank-adapter";
import { PostgresVectorIndexAdapter } from "@/infrastructure/postgres/vector-index";
import { PostgresFullTextSearchAdapter } from "@/infrastructure/postgres/fulltext-index";
import { ReciprocalRankFusion } from "@/infrastructure/postgres/fusion";
import { CitationBuilder } from "@/infrastructure/retrieval/citation-builder";
import { DefaultEntityResolver } from "@/application/retrieval/entity-resolver";
import { RetrievalService } from "@/application/retrieval/retrieval-service";
import { PostgresEntityRepository } from "@/infrastructure/postgres/repositories/entity-repository";
import { EntityRepositoryAdapter } from "@/infrastructure/adapters/entity-repository-adapter";
import { createAuthMiddleware } from "./middleware/auth-middleware";
import {
  registerQueryRoutes,
  registerDocumentsRoutes,
  registerEntitiesRoutes,
  registerFeedbackRoutes,
} from "./routes";

export async function buildApp(
  healthCheckers: HealthChecker[] = [],
  deps?: {
    uowFactory?: DefaultUnitOfWorkFactory;
    retrievalService?: RetrievalService;
  },
) {
  const app = Fastify({
    logger: true,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: { info: { title: "GroundGraph API", version: "0.1.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  const authMiddleware = createAuthMiddleware();
  app.addHook("onRequest", authMiddleware);

  app.get("/healthz", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  app.get("/ready", async (_request, reply) => {
    const start = Date.now();
    const results: Record<string, { healthy: boolean; latencyMs?: number; error?: string }> = {};
    let allHealthy = true;
    let anyChecked = false;

    for (const checker of healthCheckers) {
      anyChecked = true;
      try {
        const result = await checker.check();
        const checkResult: { healthy: boolean; latencyMs?: number; error?: string } = {
          healthy: result.healthy,
        };
        if (result.latencyMs !== undefined) {
          checkResult.latencyMs = result.latencyMs;
        }
        if (result.error !== undefined) {
          checkResult.error = result.error;
        }
        results[checker.name] = checkResult;
        if (!result.healthy) {
          allHealthy = false;
        }
      } catch (error) {
        results[checker.name] = {
          healthy: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
        allHealthy = false;
      }
    }

    const overallLatencyMs = Date.now() - start;
    const status = !anyChecked ? "degraded" : allHealthy ? "healthy" : "unhealthy";
    const statusCode = status === "unhealthy" ? 503 : 200;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      checks: results,
      overallLatencyMs,
    });
  });

  if (deps?.uowFactory) {
    await app.register(
      (instance) => registerDocumentsRoutes(instance, { uowFactory: deps.uowFactory! }),
      { prefix: "" },
    );
    await app.register(
      (instance) => registerEntitiesRoutes(instance, { uowFactory: deps.uowFactory! }),
      { prefix: "" },
    );
  }

  if (deps?.retrievalService) {
    await app.register(
      (instance) => registerQueryRoutes(instance, { retrievalWorkflow: deps.retrievalService! }),
      { prefix: "" },
    );
  }

  await app.register((instance) => registerFeedbackRoutes(instance, {}), { prefix: "" });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Validation Error",
        message: error.issues,
      });
    }

    return reply.status(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message: "An unexpected error occurred",
    });
  });

  return app;
}

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const db = new Database({
  url: process.env.DATABASE_URL ?? "postgresql://localhost:5432/groundgraph",
});
setGlobalDatabase(db);

const neo4j = new Neo4jClient({
  uri: process.env.NEO4J_HOST ?? "bolt://localhost:7687",
  user: process.env.NEO4J_USER ?? "neo4j",
  password: process.env.NEO4J_PASSWORD ?? "",
});

const minio = new ObjectStorageClient({
  accessKeyId: process.env.S3_ACCESS_KEY ?? "",
  secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  bucketRaw: process.env.S3_BUCKET_RAW ?? "groundgraph-raw",
  bucketProcessed: process.env.S3_BUCKET_PROCESSED ?? "groundgraph-processed",
});

const healthCheckers: HealthChecker[] = [
  new PostgresHealthChecker(db),
  new Neo4jHealthChecker(neo4j),
  new MinioHealthChecker(minio),
];

initTelemetry({
  serviceName: "ground-graph-api",
  serviceVersion: "0.1.0",
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
  enabled: process.env.OTEL_ENABLED !== "false",
});

const uowFactory = new DefaultUnitOfWorkFactory(db, neo4j);
const graphRepo = new Neo4jGraphRepository(neo4j);
const graphAdapter = new DefaultGraphRetrievalAdapter({
  graph: graphRepo,
  clock: () => new Date(),
  idGen: () => crypto.randomUUID(),
});

const vectorIndex = new PostgresVectorIndexAdapter(db);
const fulltextSearch = new PostgresFullTextSearchAdapter(db);
const fusion = new ReciprocalRankFusion();
const tracer = new NoopTracer();
const citationBuilder = new CitationBuilder();

const embeddingAdapter = new OpenAIEmbeddingAdapter({
  provider: (process.env.EMBEDDING_PROVIDER as "openai" | "openrouter" | "local") ?? "openai",
  model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  dimension: 1536,
  apiKey: process.env.OPENAI_API_KEY ?? "",
  ...(process.env.EMBEDDING_BASE_URL ? { baseUrl: process.env.EMBEDDING_BASE_URL } : {}),
});

const reranker = new NoopRerankAdapter("noop");

const generator = new OpenAIGeneratorAdapter({
  provider: (process.env.LLM_PROVIDER as "openai" | "openrouter") ?? "openrouter",
  model: process.env.LLM_MODEL ?? "google/gemini-2.0-flash-thinking-exp:free",
  apiKey: process.env.OPENAI_API_KEY ?? "",
  ...(process.env.LLM_BASE_URL ? { baseUrl: process.env.LLM_BASE_URL } : {}),
});

const entityRepository = new PostgresEntityRepository(db);
const entityRepositoryAdapter = new EntityRepositoryAdapter(entityRepository);
const entityResolver = new DefaultEntityResolver({
  entityRepository: entityRepositoryAdapter,
  clock: () => new Date(),
});

const hybridQuery = new HybridQueryService({
  embedding: embeddingAdapter,
  vector: vectorIndex,
  fulltext: fulltextSearch,
  graph: graphAdapter,
  reranker: reranker,
  fusion,
  generator,
  entityResolver,
  config: {
    maxCandidates: 20,
    enableFullText: true,
    enableRerank: false,
    enableGeneration: false,
    enableGraph: true,
    fusionWeights: { vector: 0.4, graph: 0.3, fulltext: 0.3 },
    refusalMinCitations: 2,
    refusalMinConfidence: 0.7,
    maxGraphDepth: 3,
    graphTraversalBudget: 50,
  },
  clock: () => new Date(),
  idGen: () => crypto.randomUUID(),
});

const retrievalService = new RetrievalService(hybridQuery, citationBuilder, generator, tracer);

const app = await buildApp(healthCheckers, { uowFactory, retrievalService });

await app.listen({ port: PORT, host: HOST });
console.log(`Server listening on ${HOST}:${PORT}`);

async function gracefulShutdown(): Promise<void> {
  console.log("Shutting down gracefully...");
  try {
    await app.close();
  } catch (err) {
    console.error("Error closing app:", err);
  }
  try {
    await db.close();
  } catch (err) {
    console.error("Error closing database:", err);
  }
  try {
    await neo4j.close();
  } catch (err) {
    console.error("Error closing Neo4j:", err);
  }
  try {
    await minio.close?.();
  } catch (err) {
    console.error("Error closing MinIO:", err);
  }
  await shutdownTelemetry();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
