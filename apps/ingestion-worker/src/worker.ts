import http from "node:http";
import { Database, setGlobalDatabase } from "@/infrastructure/postgres/client";
import { Neo4jClient } from "@/infrastructure/neo4j/client";
import { ObjectStorageClient } from "@/infrastructure/object-storage/client";
import { initTelemetry, shutdownTelemetry } from "@/infrastructure/telemetry";
import { PostgresOutboxRepository } from "@/infrastructure/postgres/repositories/outbox-repository";

const WORKER_ID = process.env.WORKER_ID ?? `worker-${crypto.randomUUID()}`;
const HEALTH_PORT = parseInt(process.env.WORKER_PORT ?? "8081", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "10", 10);
const LEASE_DURATION_MS = parseInt(process.env.LEASE_DURATION_MS ?? "60000", 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS ?? "5", 10);
const PROCESS_TENANT_ID = process.env.PROCESS_TENANT_ID ?? "00000000-0000-4000-8000-000000000001";

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

const outboxRepo = new PostgresOutboxRepository(db);

initTelemetry({
  serviceName: "ground-graph-ingestion-worker",
  serviceVersion: "0.1.0",
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
  enabled: process.env.OTEL_ENABLED !== "false",
});

async function processEvent(
  event: {
    id: string;
    aggregateType: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
  logger: typeof console,
): Promise<{ success: boolean; error?: string }> {
  const { aggregateType, eventType, payload } = event;
  logger.log(`[${WORKER_ID}] Processing event: ${aggregateType}:${eventType}`, {
    eventId: event.id,
    attempts: payload.attempts,
  });

  switch (aggregateType) {
    case "DocumentIngestion":
      return handleDocumentIngestion(event, logger);
    case "GraphProjection":
      return handleGraphProjection(event, logger);
    case "EvaluationTrigger":
      return handleEvaluationTrigger(event, logger);
    default:
      logger.log(`[${WORKER_ID}] Unknown aggregate type: ${aggregateType}, acknowledging anyway`);
      return { success: true };
  }
}

async function handleDocumentIngestion(
  event: { id: string; payload: Record<string, unknown> },
  logger: typeof console,
): Promise<{ success: boolean; error?: string }> {
  logger.log(`[${WORKER_ID}] Would trigger document ingestion for:`, event.payload);
  return { success: true };
}

async function handleGraphProjection(
  event: { id: string; payload: Record<string, unknown> },
  logger: typeof console,
): Promise<{ success: boolean; error?: string }> {
  logger.log(`[${WORKER_ID}] Would trigger graph projection for:`, event.payload);
  return { success: true };
}

async function handleEvaluationTrigger(
  event: { id: string; payload: Record<string, unknown> },
  logger: typeof console,
): Promise<{ success: boolean; error?: string }> {
  logger.log(`[${WORKER_ID}] Would trigger evaluation for:`, event.payload);
  return { success: true };
}

async function processBatch(): Promise<{
  processed: number;
  failed: number;
  deadLettered: number;
  errors: Array<{ eventId: string; error: string }>;
}> {
  const result = {
    processed: 0,
    failed: 0,
    deadLettered: 0,
    errors: [] as Array<{ eventId: string; error: string }>,
  };

  const pendingResult = await outboxRepo.findPending(PROCESS_TENANT_ID, BATCH_SIZE);
  if (!pendingResult.ok || pendingResult.value.length === 0) {
    return result;
  }

  const pendingIds = pendingResult.value.map((e) => e.id);
  const claimResult = await outboxRepo.claim(
    pendingIds,
    WORKER_ID,
    LEASE_DURATION_MS,
    PROCESS_TENANT_ID,
  );
  if (!claimResult.ok) {
    console.error(`[${WORKER_ID}] Failed to claim events:`, claimResult.error);
    return result;
  }

  const claimed = claimResult.value;
  if (claimed.length === 0) {
    return result;
  }

  console.log(`[${WORKER_ID}] Claimed ${claimed.length} events`);

  for (const event of claimed) {
    const token = event.leaseToken;
    if (!token) {
      result.errors.push({ eventId: event.id, error: "No lease token" });
      result.failed++;
      continue;
    }

    try {
      const outcome = await processEvent(event, console);
      if (outcome.success) {
        const completeResult = await outboxRepo.complete(event.id, token, PROCESS_TENANT_ID);
        if (completeResult.ok) {
          result.processed++;
        } else {
          result.errors.push({ eventId: event.id, error: completeResult.error.message });
          result.failed++;
        }
      } else {
        const failResult = await outboxRepo.fail(
          event.id,
          token,
          outcome.error ?? "Unknown error",
          PROCESS_TENANT_ID,
          MAX_ATTEMPTS,
        );
        if (!failResult.ok) {
          result.errors.push({ eventId: event.id, error: failResult.error.message });
        } else {
          result.failed++;
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.errors.push({ eventId: event.id, error: errorMsg });
      const failResult = await outboxRepo.fail(
        event.id,
        token,
        errorMsg,
        PROCESS_TENANT_ID,
        MAX_ATTEMPTS,
      );
      if (failResult.ok) {
        result.failed++;
      }
    }
  }

  return result;
}

let polling = false;
let stopped = false;

async function pollLoop(): Promise<void> {
  if (stopped || polling) return;
  polling = true;

  try {
    const result = await processBatch();
    if (result.processed > 0 || result.failed > 0 || result.deadLettered > 0) {
      console.log(
        `[${WORKER_ID}] Batch result: processed=${result.processed} failed=${result.failed} deadLettered=${result.deadLettered}`,
      );
    }
    if (result.errors.length > 0) {
      console.error(`[${WORKER_ID}] Batch errors:`, result.errors);
    }
  } catch (err) {
    console.error(`[${WORKER_ID}] Poll error:`, err);
  } finally {
    polling = false;
  }
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextPoll(): void {
  if (stopped) return;
  pollTimer = setTimeout(async () => {
    await pollLoop();
    scheduleNextPoll();
  }, POLL_INTERVAL_MS);
}

async function startHealthServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/healthz" || req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "ok",
            workerId: WORKER_ID,
            service: "ground-graph-ingestion-worker",
            version: "0.1.0",
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(HEALTH_PORT, () => {
      console.log(`[${WORKER_ID}] Health server listening on port ${HEALTH_PORT}`);
      resolve(server);
    });
  });
}

async function gracefulShutdown(): Promise<void> {
  console.log(`[${WORKER_ID}] Shutting down gracefully...`);
  stopped = true;

  if (pollTimer) {
    clearTimeout(pollTimer);
  }

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

async function main(): Promise<void> {
  console.log(`[${WORKER_ID}] Ingestion worker starting...`);
  console.log(`[${WORKER_ID}] Worker ID: ${WORKER_ID}`);
  console.log(`[${WORKER_ID}] Health port: ${HEALTH_PORT}`);
  console.log(`[${WORKER_ID}] Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log(`[${WORKER_ID}] Batch size: ${BATCH_SIZE}`);
  console.log(`[${WORKER_ID}] Lease duration: ${LEASE_DURATION_MS}ms`);
  console.log(`[${WORKER_ID}] Tenant ID: ${PROCESS_TENANT_ID}`);

  await startHealthServer();

  console.log(`[${WORKER_ID}] Outbox polling initialized`);
  scheduleNextPoll();

  console.log(`[${WORKER_ID}] Ingestion worker running (pid=${process.pid})`);
}

main().catch((err) => {
  console.error(`[${WORKER_ID}] Fatal error:`, err);
  process.exit(1);
});
