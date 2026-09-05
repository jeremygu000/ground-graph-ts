import { Database } from "../../src/infrastructure/postgres/client";
import { GenericContainer, Wait } from "testcontainers";

export const COMPONENT_POSTGRES_IMAGE = "pgvector/pgvector:0.8.6-pg16";

export interface ComponentDb {
  container: any;
  db: Database;
  close(): Promise<void>;
  reset(): Promise<void>;
}

let sharedContext: Promise<ComponentDb> | undefined;

async function bootstrapSchema(db: Database): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS sources (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      type VARCHAR(50) NOT NULL,
      uri TEXT NOT NULL,
      mime_type VARCHAR(255),
      metadata JSONB,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS execution_runs (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      workflow_name VARCHAR(100) NOT NULL,
      workflow_version VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
      input JSONB,
      output JSONB,
      error TEXT,
      trace_id VARCHAR(64),
      span_id VARCHAR(32),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      metadata JSONB,
      version_bundle JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS execution_steps (
      id UUID PRIMARY KEY,
      run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
      step_name VARCHAR(100) NOT NULL,
      step_type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      input JSONB,
      output JSONB,
      error TEXT,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      retry_count INTEGER NOT NULL DEFAULT 0,
      metadata JSONB
    )`,
    `CREATE TABLE IF NOT EXISTS execution_step_dependencies (
      id UUID PRIMARY KEY,
      step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
      depends_on_step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
      CONSTRAINT chk_no_self_dependency CHECK (step_id != depends_on_step_id),
      CONSTRAINT uq_step_dependency UNIQUE (step_id, depends_on_step_id)
    )`,
    `CREATE TABLE IF NOT EXISTS outbox_events (
      id UUID PRIMARY KEY,
      tenant_id UUID NOT NULL,
      aggregate_type VARCHAR(100) NOT NULL,
      aggregate_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      idempotency_key VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      available_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      claimed_by VARCHAR(100),
      lease_token VARCHAR(100),
      completed_at TIMESTAMPTZ,
      dead_lettered_at TIMESTAMPTZ,
      error VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_outbox_events_idempotency UNIQUE (tenant_id, idempotency_key)
    )`,
  ];

  for (const statement of statements) {
    await db.client.unsafe(statement);
  }
}

async function waitForDatabase(db: Database): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

  sharedContext = (async () => {
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
    const url = `postgres://test:test@${host}:${port}/test`;
    const db = new Database({ url, maxConnections: 4 });
    await waitForDatabase(db);
    await bootstrapSchema(db);

    return {
      container,
      db,
      close: async () => {
        await db.close();
        await container.stop();
        sharedContext = undefined;
      },
      reset: async () => {
        await db.client.unsafe(
          "TRUNCATE TABLE execution_step_dependencies, execution_steps, execution_runs, outbox_events, sources RESTART IDENTITY CASCADE",
        );
      },
    };
  })();

  return sharedContext;
}
