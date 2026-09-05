import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "../../src/infrastructure/postgres/client";
import {
  GenericContainer,
  Wait,
  getContainerRuntimeClient,
  type StartedTestContainer,
} from "testcontainers";

process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

export const COMPONENT_POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg16";

export interface ComponentDb {
  container: StartedTestContainer;
  db: Database;
  connectionString: string;
  close(): Promise<void>;
  reset(): Promise<void>;
}

let sharedContext: Promise<ComponentDb> | undefined;
let sharedContextRefs = 0;

async function bootstrapSchema(db: Database): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(currentDir, "../../drizzle/migrations");
  const migrationFiles = [
    "0001_initial_schema.sql",
    "0002_fulltext_and_vector_indexes.sql",
    "0003_principal_id_columns.sql",
  ];
  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const migrationSql = await fs.readFile(migrationPath, "utf8");
    await db.client.unsafe(migrationSql);
  }
}

async function createComponentDb(bootstrap = true, managed = true): Promise<ComponentDb> {
  const container = await new GenericContainer(COMPONENT_POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_USER: "test",
      POSTGRES_PASSWORD: "test",
      POSTGRES_DB: "test",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forListeningPorts().withStartupTimeout(120_000))
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();
  const connectionString = `postgres://test:test@${host}:${port}/test`;
  const db = new Database({ url: connectionString, maxConnections: 4 });

  const close = async (): Promise<void> => {
    if (!managed) {
      await db.close();
      await container.stop();
      return;
    }

    sharedContextRefs = Math.max(0, sharedContextRefs - 1);
    if (sharedContextRefs > 0) {
      return;
    }

    sharedContext = undefined;
    await db.close();
    await container.stop();
  };

  try {
    await waitForDatabase(db);
    if (bootstrap) {
      await bootstrapSchema(db);
    }

    return {
      container,
      db,
      connectionString,
      close,
      reset: async () => {
        await db.client.unsafe(
          "TRUNCATE TABLE execution_step_dependencies, execution_steps, execution_runs, outbox_events, sources RESTART IDENTITY CASCADE",
        );
      },
    };
  } catch (error) {
    await db.close().catch(() => undefined);
    await container.stop().catch(() => undefined);
    throw error;
  }
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

export async function assertContainerRuntime(): Promise<void> {
  try {
    await getContainerRuntimeClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Container runtime is required for component tests. Start Docker or another compatible runtime, then rerun pnpm test:component. Original error: ${message}`,
    );
  }
}

export async function startComponentDatabase(): Promise<ComponentDb> {
  if (sharedContext) {
    sharedContextRefs += 1;
    return sharedContext;
  }

  sharedContext = createComponentDb(true, true);
  sharedContextRefs = 1;

  return sharedContext;
}

export async function startRawComponentDatabase(): Promise<ComponentDb> {
  return createComponentDb(false, false);
}
