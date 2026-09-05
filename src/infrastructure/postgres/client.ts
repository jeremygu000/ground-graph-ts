import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
}

export class Database {
  private pool: ReturnType<typeof postgres>;
  readonly drizzle: ReturnType<typeof drizzle>;

  constructor(config: DatabaseConfig) {
    this.pool = postgres(config.url, {
      max: config.maxConnections ?? 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.drizzle = drizzle(this.pool, { schema });
  }

  get client() {
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(fn: (tx: ReturnType<typeof drizzle>) => Promise<T>): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.drizzle.transaction(fn as any) as Promise<T>;
  }
}

let globalDatabase: Database | undefined;

export function setGlobalDatabase(db: Database): void {
  globalDatabase = db;
}

export function getGlobalDatabase(): Database {
  if (!globalDatabase) {
    throw new Error("Database not initialized. Call setGlobalDatabase first.");
  }
  return globalDatabase;
}
