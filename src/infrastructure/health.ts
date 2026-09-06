import type { HealthChecker, HealthResult } from "../application/health.types";
import type { Database } from "./postgres/client";
import type { Neo4jClient } from "./neo4j/client";
import type { ObjectStorageClient } from "./object-storage/client";

export class PostgresHealthChecker implements HealthChecker {
  name = "postgresql";
  constructor(private db: Database) {}

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const result = await this.db.client`SELECT 1 as health`;
      const latencyMs = Date.now() - start;
      if (result && result[0]?.health === 1) {
        return { healthy: true, latencyMs };
      }
      return { healthy: false, message: "Unexpected response", latencyMs };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - start,
      };
    }
  }
}

export class Neo4jHealthChecker implements HealthChecker {
  name = "neo4j";
  constructor(private client: Neo4jClient) {}

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const healthy = await this.client.verifyConnectivity();
      const latencyMs = Date.now() - start;
      if (healthy) {
        return { healthy: true, latencyMs };
      }
      return { healthy: false, message: "Connectivity verification failed", latencyMs };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - start,
      };
    }
  }
}

export class MinioHealthChecker implements HealthChecker {
  name = "minio";
  constructor(private client: ObjectStorageClient) {}

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const exists = await this.client.exists(".health-check", "raw");
      const latencyMs = Date.now() - start;
      if (!exists) {
        return { healthy: false, error: "Health check file not found", latencyMs };
      }
      return { healthy: true, latencyMs };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - start,
      };
    }
  }
}
