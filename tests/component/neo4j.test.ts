import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import neo4j from "neo4j-driver";
import { Neo4jClient } from "../../src/infrastructure/neo4j/client";
import { Neo4jGraphRepository } from "../../src/infrastructure/neo4j/graph-repository";
import {
  decodeNeo4jDateTime,
  decodeNeo4jJsonProperty,
  decodeNeo4jJsonValue,
  encodeNeo4jDateTime,
  encodeNeo4jJsonProperty,
  encodeNeo4jJsonValue,
} from "../../src/infrastructure/neo4j";
import { KnowledgeFactSchema } from "../../src/domain/knowledge/types";
import { assertContainerRuntime } from "./test-support";

await assertContainerRuntime();

describe("Neo4jGraphRepository component", () => {
  const image = "neo4j:5.26-community";
  let container: StartedTestContainer;
  let client: Neo4jClient;
  let repository: Neo4jGraphRepository;
  const tenantId = crypto.randomUUID();

  beforeAll(async () => {
    container = await new GenericContainer(image)
      .withEnvironment({
        NEO4J_AUTH: "neo4j/testpassword",
        NEO4J_PLUGINS: "[]",
        NEO4J_server_memory_heap_initial__size: "256m",
        NEO4J_server_memory_heap_max__size: "256m",
        NEO4J_server_memory_pagecache_size: "128m",
      })
      .withExposedPorts(7687)
      .withWaitStrategy(Wait.forListeningPorts())
      .withStartupTimeout(120_000)
      .start();

    client = new Neo4jClient({
      uri: `bolt://${container.getHost()}:${container.getMappedPort(7687)}`,
      user: "neo4j",
      password: "testpassword",
      maxConnectionPoolSize: 4,
    });
    repository = new Neo4jGraphRepository(client);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await container?.stop();
  });

  it("verifies connectivity", async () => {
    await expect(client.verifyConnectivity()).resolves.toBe(true);
  });

  it("projects a fact idempotently and can read connected entities", async () => {
    const subjectId = crypto.randomUUID();
    const objectId = crypto.randomUUID();
    const factId = crypto.randomUUID();
    const tenantIdB = crypto.randomUUID();

    await client.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Entity {id: $subjectId, tenantId: $tenantId, validFrom: datetime(), createdAt: datetime()})
         CREATE (:Entity {id: $objectId, tenantId: $tenantId, validFrom: datetime(), createdAt: datetime()})`,
        { subjectId, objectId, tenantId },
      );
      await tx.run(
        `CREATE (:Entity {id: $foreignId, tenantId: $tenantIdB, validFrom: datetime(), createdAt: datetime()})`,
        { foreignId: crypto.randomUUID(), tenantIdB },
      );
    });

    const projection = KnowledgeFactSchema.parse({
      id: factId,
      tenantId,
      subjectId,
      predicate: "related_to",
      objectId,
      status: "verified",
      extractionMethod: "human",
      confidence: 0.9,
      validFrom: "2024-01-15T10:30:00.000Z",
      validTo: "2024-01-16T10:30:00.000Z",
      observedAt: "2024-01-15T10:45:00.000Z",
      createdAt: "2024-01-15T10:50:00.000Z",
      provenance: {
        sourceVersionId: crypto.randomUUID(),
        evidenceText: "source evidence",
      },
    });

    const first = await repository.projectFact(projection);
    expect(first.ok, first.ok ? undefined : first.error.message).toBe(true);
    const second = await repository.projectFact(projection);
    expect(second.ok, second.ok ? undefined : second.error.message).toBe(true);

    const connected = await repository.findConnectedEntities(subjectId, 2, tenantId);
    expect(connected.ok, connected.ok ? undefined : connected.error.message).toBe(true);
    if (!connected.ok) throw connected.error;
    expect(connected.value.some((item) => item.entityId === objectId)).toBe(true);

    const paths = await repository.findPaths(
      { startEntityId: subjectId, endEntityId: objectId, maxHops: 2 },
      tenantId,
    );
    expect(paths.ok).toBe(true);
    if (!paths.ok) throw paths.error;
    expect(paths.value.length).toBeGreaterThan(0);

    const crossTenant = await repository.findConnectedEntities(subjectId, 2, tenantIdB);
    expect(crossTenant.ok).toBe(true);
    if (!crossTenant.ok) throw crossTenant.error;
    expect(crossTenant.value).toHaveLength(0);

    const traversed = await repository.traverse(
      { seedEntityIds: [subjectId], maxDepth: 2 },
      tenantId,
    );
    expect(traversed.ok).toBe(true);
    if (!traversed.ok) throw traversed.error;
    expect(traversed.value.some((item) => item.entityId === objectId)).toBe(true);

    const verify = await client.executeRead(async (tx) => {
      const result = await tx.run(
        "MATCH (f:Fact {id: $factId, tenantId: $tenantId}) RETURN count(f) AS count",
        {
          factId,
          tenantId,
        },
      );
      return result.records[0]?.get("count").toNumber() ?? 0;
    });
    expect(verify).toBe(1);

    const storedProjection = await client.executeRead(async (tx) => {
      const result = await tx.run(
        `MATCH (f:Fact {id: $factId, tenantId: $tenantId})
         RETURN f.validFrom AS validFrom,
                f.validTo AS validTo,
                f.observedAt AS observedAt,
                f.createdAt AS createdAt,
                f.provenanceJson AS provenanceJson`,
        {
          factId,
          tenantId,
        },
      );
      const record = result.records[0];
      return {
        validFrom: record?.get("validFrom"),
        validTo: record?.get("validTo"),
        observedAt: record?.get("observedAt"),
        createdAt: record?.get("createdAt"),
        provenanceJson: record?.get("provenanceJson"),
      };
    });

    expect(neo4j.isDateTime(storedProjection.validFrom)).toBe(true);
    expect(decodeNeo4jDateTime(storedProjection.validFrom)).toBe(projection.validFrom);
    expect(decodeNeo4jDateTime(storedProjection.validTo)).toBe(projection.validTo);
    expect(decodeNeo4jDateTime(storedProjection.observedAt)).toBe(projection.observedAt);
    expect(decodeNeo4jDateTime(storedProjection.createdAt)).toBe(projection.createdAt);
    expect(decodeNeo4jJsonProperty(storedProjection.provenanceJson)).toEqual(projection.provenance);

    const nestedAttributes = {
      alpha: "one",
      beta: [1, { gamma: true }],
      delta: {
        epsilon: "nested",
      },
    };

    const encodedAttributes = encodeNeo4jJsonProperty(nestedAttributes);
    const encodedTimestamp = encodeNeo4jDateTime("2024-01-15T10:30:00.000Z");

    await client.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (:RoundTripProbe {
          id: $id,
          tenantId: $tenantId,
          payloadJson: $payloadJson,
          createdAt: $createdAt
        })`,
        {
          id: crypto.randomUUID(),
          tenantId,
          payloadJson: encodedAttributes,
          createdAt: encodedTimestamp,
        },
      );
    });

    const roundTrip = await client.executeRead(async (tx) => {
      const result = await tx.run(
        `MATCH (n:RoundTripProbe {tenantId: $tenantId})
         RETURN n.payloadJson AS payloadJson, n.createdAt AS createdAt
         ORDER BY n.createdAt DESC
         LIMIT 1`,
        { tenantId },
      );
      const record = result.records[0];
      return {
        payloadJson: record?.get("payloadJson"),
        createdAt: record?.get("createdAt"),
      };
    });

    expect(decodeNeo4jJsonProperty(roundTrip.payloadJson)).toEqual(nestedAttributes);
    expect(decodeNeo4jDateTime(roundTrip.createdAt)).toBe("2024-01-15T10:30:00.000Z");

    expect(() => encodeNeo4jJsonValue({ bad: new Date() })).toThrow("Invalid JSON value");
    expect(() => decodeNeo4jJsonValue({ bad: new Date() })).toThrow("Invalid Neo4j JSON value");

    const zeroRows = await repository.projectFact({
      ...projection,
      tenantId: tenantIdB,
    });
    expect(zeroRows.ok).toBe(false);
    if (zeroRows.ok) throw new Error("expected tenant mismatch failure");
    expect(zeroRows.error.message).toContain("tenant mismatch");
  });
});
