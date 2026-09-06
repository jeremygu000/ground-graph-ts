import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import type { HealthChecker } from "@/application/health";
import {
  PostgresHealthChecker,
  Neo4jHealthChecker,
  MinioHealthChecker,
} from "@/infrastructure/health";
import { Database, setGlobalDatabase } from "@/infrastructure/postgres/client";
import { Neo4jClient } from "@/infrastructure/neo4j/client";
import { ObjectStorageClient } from "@/infrastructure/object-storage/client";
import { initTelemetry, shutdownTelemetry } from "@/infrastructure/telemetry";

export async function buildApp(healthCheckers: HealthChecker[] = []) {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, { origin: true });
  await app.register(swagger, {
    openapi: { info: { title: "GroundGraph API", version: "0.1.0" } },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

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

const app = await buildApp(healthCheckers);

await app.listen({ port: PORT, host: HOST });
console.log(`Server listening on ${HOST}:${PORT}`);

async function gracefulShutdown(): Promise<void> {
  console.log("Shutting down gracefully...");
  await app.close();
  await shutdownTelemetry();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
