import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "../../src/infrastructure/postgres/client";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

export const COMPONENT_POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg16";

export interface ComponentDb {
  container: StartedTestContainer;
  db: Database;
  close(): Promise<void>;
  reset(): Promise<void>;
}

let sharedContext: Promise<ComponentDb> | undefined;
let processCleanupRegistered = false;

async function bootstrapSchema(db: Database): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationPath = path.resolve(currentDir, "../../drizzle/migrations/0001_initial_schema.sql");
  const migrationSql = await fs.readFile(migrationPath, "utf8");
  await db.client.unsafe(migrationSql);
}

async function createComponentDb(): Promise<ComponentDb> {
  const container = await new GenericContainer(COMPONENT_POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"))
    .withStartupTimeout(120_000)
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();
  const db = new Database({ url: `postgres://test:test@${host}:${port}/test`, maxConnections: 4 });
  await waitForDatabase(db);
  await bootstrapSchema(db);

  return {
    container,
    db,
    close: async () => {},
    reset: async () => {
      await db.client.unsafe(
        "TRUNCATE TABLE execution_step_dependencies, execution_steps, execution_runs, outbox_events, sources RESTART IDENTITY CASCADE",
      );
    },
  };
}

async function waitForDatabase(db: Database): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await db.client.unsafe("select 1");
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !message.includes("ECONNRESET") &&
        !message.includes("Connection terminated") &&
        !message.includes("connection refused")
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("Database did not become ready in time");
}

export async function startComponentDatabase(): Promise<ComponentDb> {
  if (sharedContext) {
    return sharedContext;
  }

  sharedContext = createComponentDb();

  if (!processCleanupRegistered) {
    processCleanupRegistered = true;
    process.once("beforeExit", async () => {
      if (!sharedContext) return;
      const ctx = await sharedContext;
      await ctx.db.close();
      await ctx.container.stop();
      sharedContext = undefined;
    });
  }

  return sharedContext;
}
