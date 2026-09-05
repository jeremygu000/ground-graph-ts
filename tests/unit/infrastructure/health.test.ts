import { describe, expect, it, vi } from "vitest";
import {
  MinioHealthChecker,
  Neo4jHealthChecker,
  PostgresHealthChecker,
} from "../../../src/infrastructure/health";

describe("health checkers", () => {
  it("checks postgres health from tagged query results", async () => {
    const client = vi.fn().mockResolvedValue([{ health: 1 }]);
    const checker = new PostgresHealthChecker({ client } as never);

    const result = await checker.check();
    expect(result.healthy).toBe(true);
    expect(client).toHaveBeenCalledTimes(1);
  });

  it("returns unhealthy postgres results and error messages", async () => {
    const badResultClient = vi.fn().mockResolvedValue([{ health: 0 }]);
    const badResultChecker = new PostgresHealthChecker({ client: badResultClient } as never);
    await expect(badResultChecker.check()).resolves.toMatchObject({
      healthy: false,
      message: "Unexpected response",
    });

    const client = vi.fn().mockRejectedValue(new Error("boom"));
    const checker = new PostgresHealthChecker({ client } as never);

    const result = await checker.check();
    expect(result.healthy).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("checks neo4j and minio health", async () => {
    const neo4jChecker = new Neo4jHealthChecker({
      verifyConnectivity: vi.fn().mockResolvedValue(true),
    } as never);
    await expect(neo4jChecker.check()).resolves.toMatchObject({ healthy: true });

    await expect(
      new Neo4jHealthChecker({
        verifyConnectivity: vi.fn().mockResolvedValue(false),
      } as never).check(),
    ).resolves.toMatchObject({ healthy: false, message: "Connectivity verification failed" });

    await expect(
      new Neo4jHealthChecker({
        verifyConnectivity: vi.fn().mockRejectedValue(new Error("neo4j boom")),
      } as never).check(),
    ).resolves.toMatchObject({ healthy: false, error: "neo4j boom" });

    const minioChecker = new MinioHealthChecker({
      exists: vi.fn().mockResolvedValue(true),
    } as never);
    await expect(minioChecker.check()).resolves.toMatchObject({ healthy: true });

    await expect(
      new MinioHealthChecker({
        exists: vi.fn().mockResolvedValue(false),
      } as never).check(),
    ).resolves.toMatchObject({ healthy: false, error: "Health check file not found" });

    await expect(
      new MinioHealthChecker({
        exists: vi.fn().mockRejectedValue(new Error("minio boom")),
      } as never).check(),
    ).resolves.toMatchObject({ healthy: false, error: "minio boom" });
  });
});
