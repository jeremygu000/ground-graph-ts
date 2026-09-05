import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
}

export class Database {
  private pool: ReturnType<typeof postgres>;
  private db: ReturnType<typeof drizzle>;

  constructor(config: DatabaseConfig) {
    this.pool = postgres(config.url, {
      max: config.maxConnections ?? 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    this.db = drizzle(this.pool, { schema });
  }

  get client() {
    return this.pool;
  }

  get drizzle() {
    return this.db;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
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
