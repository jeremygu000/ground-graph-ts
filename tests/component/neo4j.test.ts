import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Neo4jClient } from "../../src/infrastructure/neo4j/client";
import { execFile } from "node:child_process";

async function captureDockerInspect(containerId: string): Promise<void> {
  await new Promise((resolve) => {
    execFile("docker", ["inspect", containerId], () => resolve(undefined));
  });
}

describe("Neo4j component smoke", () => {
  const image = "neo4j:5.26-community";
  let container: StartedTestContainer;
  let client: Neo4jClient;

  beforeAll(async () => {
    try {
      container = await new GenericContainer(image)
        .withEnvironment({
          NEO4J_AUTH: "neo4j/testpassword",
          NEO4J_PLUGINS: "[]",
        })
        .withExposedPorts(7687)
        .withWaitStrategy(Wait.forListeningPorts())
        .withStartupTimeout(120_000)
        .start();
    } catch (error) {
      await captureDockerInspect((error as { containerId?: string }).containerId ?? "");
      throw error;
    }

    client = new Neo4jClient({
      uri: `bolt://${container.getHost()}:${container.getMappedPort(7687)}`,
      user: "neo4j",
      password: "testpassword",
      maxConnectionPoolSize: 4,
    });
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await container?.stop();
  });

  it("verifies connectivity", async () => {
    await expect(client.verifyConnectivity()).resolves.toBe(true);
  });

  it("can execute a read query", async () => {
    const value = await client.executeRead(async (tx) => {
      const result = await tx.run("RETURN 1 AS value");
      return result.records[0]?.get("value").toNumber();
    });

    expect(value).toBe(1);
  });
});
