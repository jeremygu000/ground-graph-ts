import { describe, expect, it, vi } from "vitest";
import {
  PostgresHealthChecker,
  Neo4jHealthChecker,
  MinioHealthChecker,
} from "../../../src/infrastructure/health";
import type { Database } from "../../../src/infrastructure/postgres/client";
import type { Neo4jClient } from "../../../src/infrastructure/neo4j/client";
import type { ObjectStorageClient } from "../../../src/infrastructure/object-storage/client";

describe("infrastructure health checkers", () => {
  it("reports postgres healthy when select 1 returns 1", async () => {
    const db = {
      client: Object.assign(
        vi.fn(async () => [{ health: 1 }]),
        { unsafe: vi.fn() },
      ),
    } as unknown as Database;
    const checker = new PostgresHealthChecker(db);

    const result = await checker.check();

    expect(result.healthy).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports neo4j unhealthy when connectivity fails", async () => {
    const client = { verifyConnectivity: vi.fn(async () => false) } as unknown as Neo4jClient;
    const checker = new Neo4jHealthChecker(client);

    const result = await checker.check();

    expect(result.healthy).toBe(false);
    expect(result.message).toBe("Connectivity verification failed");
  });

  it("reports minio unhealthy when health check file is missing", async () => {
    const client = { exists: vi.fn(async () => false) } as unknown as ObjectStorageClient;
    const checker = new MinioHealthChecker(client);

    const result = await checker.check();

    expect(result.healthy).toBe(false);
    expect(result.error).toBe("Health check file not found");
  });
});
