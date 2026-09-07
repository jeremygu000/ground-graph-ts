import { Database, setGlobalDatabase } from "@/infrastructure/postgres/client";
import { Neo4jClient } from "@/infrastructure/neo4j/client";
import { ObjectStorageClient } from "@/infrastructure/object-storage/client";
import { initTelemetry, shutdownTelemetry } from "@/infrastructure/telemetry";

const WORKER_ID = process.env.WORKER_ID ?? `worker-${crypto.randomUUID()}`;
const PORT = parseInt(process.env.WORKER_PORT ?? "8081", 10);

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

initTelemetry({
  serviceName: "ground-graph-ingestion-worker",
  serviceVersion: "0.1.0",
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
  enabled: process.env.OTEL_ENABLED !== "false",
});

console.log(`[${WORKER_ID}] Ingestion worker starting...`);

async function gracefulShutdown(): Promise<void> {
  console.log(`[${WORKER_ID}] Shutting down gracefully...`);
  try {
    await db.close();
  } catch (err) {
    console.error(`[${WORKER_ID}] Error closing database:`, err);
  }
  try {
    await neo4j.close();
  } catch (err) {
    console.error(`[${WORKER_ID}] Error closing Neo4j:`, err);
  }
  try {
    await minio.close?.();
  } catch (err) {
    console.error(`[${WORKER_ID}] Error closing MinIO:`, err);
  }
  await shutdownTelemetry();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

console.log(`[${WORKER_ID}] Ingestion worker initialized (pid=${process.pid})`);
console.log(`[${WORKER_ID}] Listening on port ${PORT} for health checks`);
console.log(`[${WORKER_ID}] Outbox polling not yet implemented - worker is in placeholder state`);
