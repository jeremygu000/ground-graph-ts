import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Neo4jClient } from "../../src/infrastructure/neo4j/client";
import { Neo4jGraphRepository } from "../../src/infrastructure/neo4j/graph-repository";
import { KnowledgeFactSchema } from "../../src/domain/knowledge/knowledge.schema";
import { assertContainerRuntime } from "./test-support";

await assertContainerRuntime();

describe("Neo4jGraphRepository M5 component tests", () => {
  const image = "neo4j:5.26-community";
  let container: StartedTestContainer;
  let client: Neo4jClient;
  let repository: Neo4jGraphRepository;
  const tenantId = crypto.randomUUID();
  const tenantIdB = crypto.randomUUID();

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

  async function createEntity(entityId: string, tenant: string): Promise<void> {
    await client.executeWrite(async (tx) => {
      await tx.run(
        `CREATE (:Entity {id: $id, tenantId: $tenantId, validFrom: datetime(), createdAt: datetime()})`,
        { id: entityId, tenantId: tenant },
      );
    });
  }

  async function projectFact(
    factId: string,
    subjectId: string,
    objectId: string,
    predicate: string,
    tenant: string,
    status = "verified",
  ): Promise<void> {
    const fact = KnowledgeFactSchema.parse({
      id: factId,
      tenantId: tenant,
      subjectId,
      predicate,
      objectId,
      status,
      extractionMethod: "human",
      confidence: 0.9,
      validFrom: "2024-01-01T00:00:00.000Z",
      observedAt: "2024-01-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      provenance: { sourceVersionId: crypto.randomUUID(), evidenceText: "test" },
    });
    const result = await repository.projectFact(fact);
    expect(result.ok, result.ok ? "" : result.error.message).toBe(true);
  }

  describe("Deep graph traversal", () => {
    it("traverses 5 hops through a chain", async () => {
      const chain = Array.from({ length: 6 }, () => crypto.randomUUID());
      for (const eid of chain) {
        await createEntity(eid, tenantId);
      }
      for (let i = 0; i < chain.length - 1; i++) {
        await projectFact(crypto.randomUUID(), chain[i]!, chain[i + 1]!, "connects_to", tenantId);
      }

      const traversed = await repository.traverse(
        { seedEntityIds: [chain[0]!], maxDepth: 5 },
        tenantId,
      );
      expect(traversed.ok, traversed.ok ? "" : traversed.error.message).toBe(true);
      if (!traversed.ok) throw traversed.error;
      expect(traversed.value.length).toBeGreaterThan(0);
    });

    it.skip("limits traversal by maxDepth", async () => {
      const entities = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of entities) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), entities[0]!, entities[1]!, "level1", tenantId);
      await projectFact(crypto.randomUUID(), entities[1]!, entities[2]!, "level2", tenantId);

      const depth2 = await repository.traverse(
        { seedEntityIds: [entities[0]!], maxDepth: 2 },
        tenantId,
      );
      expect(depth2.ok, depth2.ok ? "" : depth2.error.message).toBe(true);
      if (!depth2.ok) throw depth2.error;
      expect(depth2.value.length).toBeGreaterThan(0);
    });

    it.skip("handles branching graph traversal", async () => {
      const root = crypto.randomUUID();
      const branch1 = crypto.randomUUID();
      const branch2 = crypto.randomUUID();
      const leaf1 = crypto.randomUUID();
      const leaf2 = crypto.randomUUID();

      for (const eid of [root, branch1, branch2, leaf1, leaf2]) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), root, branch1, "has", tenantId);
      await projectFact(crypto.randomUUID(), root, branch2, "has", tenantId);
      await projectFact(crypto.randomUUID(), branch1, leaf1, "contains", tenantId);
      await projectFact(crypto.randomUUID(), branch2, leaf2, "contains", tenantId);

      const traversed = await repository.traverse({ seedEntityIds: [root], maxDepth: 2 }, tenantId);
      expect(traversed.ok, traversed.ok ? "" : traversed.error.message).toBe(true);
      if (!traversed.ok) throw traversed.error;
      expect(traversed.value.length).toBeGreaterThan(0);
    });
  });

  describe.skip("Path finding", () => {
    it("finds paths up to maxHops", async () => {
      const [a, b, c, d] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ];
      for (const eid of [a, b, c, d]) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), a, b, "rel", tenantId);
      await projectFact(crypto.randomUUID(), b, c, "rel", tenantId);
      await projectFact(crypto.randomUUID(), c, d, "rel", tenantId);

      const paths3 = await repository.findPaths(
        { startEntityId: a, endEntityId: d, maxHops: 3 },
        tenantId,
      );
      expect(paths3.ok, paths3.ok ? "" : paths3.error.message).toBe(true);
      if (!paths3.ok) throw paths3.error;
      expect(paths3.value.length).toBeGreaterThan(0);
      expect(paths3.value[0]!.totalHops).toBe(3);

      const paths1 = await repository.findPaths(
        { startEntityId: a, endEntityId: d, maxHops: 1 },
        tenantId,
      );
      expect(paths1.ok, paths1.ok ? "" : paths1.error.message).toBe(true);
      if (!paths1.ok) throw paths1.error;
      expect(paths1.value.length).toBe(0);
    });

    it("finds multiple paths and returns shortest first", async () => {
      const [start, mid1, mid2, end] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ];
      for (const eid of [start, mid1, mid2, end]) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), start, mid1, "rel", tenantId);
      await projectFact(crypto.randomUUID(), mid1, end, "rel", tenantId);
      await projectFact(crypto.randomUUID(), start, mid2, "rel", tenantId);
      await projectFact(crypto.randomUUID(), mid2, end, "rel", tenantId);

      const paths = await repository.findPaths(
        { startEntityId: start, endEntityId: end, maxHops: 5 },
        tenantId,
      );
      expect(paths.ok, paths.ok ? "" : paths.error.message).toBe(true);
      if (!paths.ok) throw paths.error;
      expect(paths.value.length).toBe(2);
      expect(paths.value[0]!.totalHops).toBeLessThanOrEqual(paths.value[1]!.totalHops);
    });

    it("isolates paths between tenants", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      await createEntity(a, tenantId);
      await createEntity(b, tenantId);
      await createEntity(crypto.randomUUID(), tenantIdB);

      await projectFact(crypto.randomUUID(), a, b, "owns", tenantId);
      const crossTenant = await repository.findPaths(
        { startEntityId: a, endEntityId: b, maxHops: 3 },
        tenantIdB,
      );
      expect(crossTenant.ok, crossTenant.ok ? "" : crossTenant.error.message).toBe(true);
      if (!crossTenant.ok) throw crossTenant.error;
      expect(crossTenant.value.length).toBe(0);
    });
  });

  describe.skip("Connected entities", () => {
    it("returns entities at exact depth", async () => {
      const [a, b, c, d] = [
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
        crypto.randomUUID(),
      ];
      for (const eid of [a, b, c, d]) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), a, b, "p", tenantId);
      await projectFact(crypto.randomUUID(), b, c, "p", tenantId);
      await projectFact(crypto.randomUUID(), c, d, "p", tenantId);

      const depth1 = await repository.findConnectedEntities(a, 1, tenantId);
      expect(depth1.ok, depth1.ok ? "" : depth1.error.message).toBe(true);
      if (!depth1.ok) throw depth1.error;
      expect(depth1.value.some((e) => e.entityId === b)).toBe(true);
      expect(depth1.value.some((e) => e.entityId === c)).toBe(false);

      const depth2 = await repository.findConnectedEntities(a, 2, tenantId);
      expect(depth2.ok, depth2.ok ? "" : depth2.error.message).toBe(true);
      if (!depth2.ok) throw depth2.error;
      expect(depth2.value.some((e) => e.entityId === c)).toBe(true);
      expect(depth2.value.some((e) => e.entityId === d)).toBe(false);

      const depth3 = await repository.findConnectedEntities(a, 3, tenantId);
      expect(depth3.ok, depth3.ok ? "" : depth3.error.message).toBe(true);
      if (!depth3.ok) throw depth3.error;
      expect(depth3.value.some((e) => e.entityId === d)).toBe(true);
    });

    it("deduplicates entities at same depth", async () => {
      const [a, b, c] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of [a, b, c]) await createEntity(eid, tenantId);
      await projectFact(crypto.randomUUID(), a, b, "rel", tenantId);
      await projectFact(crypto.randomUUID(), b, c, "rel", tenantId);
      await projectFact(crypto.randomUUID(), a, c, "rel", tenantId);

      const connected = await repository.findConnectedEntities(a, 2, tenantId);
      expect(connected.ok, connected.ok ? "" : connected.error.message).toBe(true);
      if (!connected.ok) throw connected.error;
      const cEntities = connected.value.filter((e) => e.entityId === c);
      expect(cEntities.length).toBe(1);
    });
  });

  describe("Fact projection", () => {
    it("idempotently projects the same fact twice", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of [a, b]) await createEntity(eid, tenantId);
      const factId = crypto.randomUUID();
      const fact = KnowledgeFactSchema.parse({
        id: factId,
        tenantId,
        subjectId: a,
        predicate: "rel",
        objectId: b,
        status: "verified",
        extractionMethod: "human",
        confidence: 0.9,
        validFrom: "2024-01-01T00:00:00.000Z",
        validTo: undefined,
        observedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        provenance: { sourceVersionId: crypto.randomUUID(), evidenceText: "test" },
      });

      const first = await repository.projectFact(fact);
      expect(first.ok, first.ok ? "" : first.error.message).toBe(true);
      const second = await repository.projectFact(fact);
      expect(second.ok, second.ok ? "" : second.error.message).toBe(true);

      const count = await client.executeRead(async (tx) => {
        const result = await tx.run("MATCH (f:Fact {id: $fid}) RETURN count(f) AS count", {
          fid: factId,
        });
        return result.records[0]?.get("count").toNumber() ?? 0;
      });
      expect(count).toBe(1);
    });

    it("stores provenance with fact", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of [a, b]) await createEntity(eid, tenantId);
      const factId = crypto.randomUUID();
      const sourceVersionId = crypto.randomUUID();
      const fact = KnowledgeFactSchema.parse({
        id: factId,
        tenantId,
        subjectId: a,
        predicate: "derived_from",
        objectId: b,
        status: "verified",
        extractionMethod: "llm",
        confidence: 0.88,
        validFrom: "2024-01-01T00:00:00.000Z",
        validTo: undefined,
        observedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        provenance: {
          sourceVersionId,
          chunkId: crypto.randomUUID(),
          evidenceText: "Document states X derives from Y",
        },
      });

      const result = await repository.projectFact(fact);
      expect(result.ok, result.ok ? "" : result.error.message).toBe(true);

      const stored = await client.executeRead(async (tx) => {
        const res = await tx.run(
          "MATCH (f:Fact {id: $fid}) RETURN f.extractionMethod AS method, f.confidence AS conf, f.provenanceJson AS prov",
          { fid: factId },
        );
        const record = res.records[0];
        const confValue = record?.get("conf");
        let conf: number | null = null;
        if (confValue !== null && confValue !== undefined) {
          if (typeof confValue === "number") {
            conf = confValue;
          } else if (typeof confValue === "object" && "toNumber" in confValue) {
            conf = (confValue as { toNumber: () => number }).toNumber();
          }
        }
        return {
          method: record?.get("method"),
          conf,
          prov: record?.get("prov"),
        };
      });

      expect(stored.method).toBe("llm");
      expect(stored.conf).toBeCloseTo(0.88, 2);
      expect(stored.prov).not.toBeNull();
    });

    it("rejects projection without object", async () => {
      const [a] = [crypto.randomUUID()];
      await createEntity(a, tenantId);
      const factWithoutObject = KnowledgeFactSchema.parse({
        id: crypto.randomUUID(),
        tenantId,
        subjectId: a,
        predicate: "self_ref",
        objectId: undefined,
        objectValue: undefined,
        status: "verified",
        extractionMethod: "human",
        confidence: 0.9,
        validFrom: "2024-01-01T00:00:00.000Z",
        validTo: undefined,
        observedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        provenance: { sourceVersionId: crypto.randomUUID(), evidenceText: "test" },
      });

      const result = await repository.projectFact(factWithoutObject);
      expect(result.ok).toBe(false);
    });
  });

  describe.skip("Fact deletion", () => {
    it("deletes a fact and updates graph", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of [a, b]) await createEntity(eid, tenantId);
      const factId = crypto.randomUUID();
      await projectFact(factId, a, b, "rel", tenantId);

      const before = await repository.findConnectedEntities(a, 1, tenantId);
      expect(before.ok, before.ok ? "" : before.error.message).toBe(true);
      if (!before.ok) throw before.error;
      expect(before.value.some((e) => e.entityId === b)).toBe(true);

      const deleteResult = await repository.deleteFact(factId, tenantId);
      expect(deleteResult.ok, deleteResult.ok ? "" : deleteResult.error.message).toBe(true);

      const after = await repository.findConnectedEntities(a, 1, tenantId);
      expect(after.ok, after.ok ? "" : after.error.message).toBe(true);
      if (!after.ok) throw after.error;
      expect(after.value.some((e) => e.entityId === b)).toBe(false);
    });

    it.skip("fails to delete fact from wrong tenant", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      for (const eid of [a, b]) await createEntity(eid, tenantId);
      const factId = crypto.randomUUID();
      await projectFact(factId, a, b, "rel", tenantId);

      const result = await repository.deleteFact(factId, tenantIdB);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected failure");
      expect(result.error.message).toContain("tenant mismatch");
    });
  });

  describe.skip("Graph metrics", () => {
    it("supports graph statistics through traversal", async () => {
      const entities = Array.from({ length: 7 }, () => crypto.randomUUID());
      for (const eid of entities) await createEntity(eid, tenantId);

      await projectFact(crypto.randomUUID(), entities[0]!, entities[1]!, "a", tenantId);
      await projectFact(crypto.randomUUID(), entities[0]!, entities[2]!, "b", tenantId);
      await projectFact(crypto.randomUUID(), entities[1]!, entities[3]!, "c", tenantId);
      await projectFact(crypto.randomUUID(), entities[1]!, entities[4]!, "d", tenantId);
      await projectFact(crypto.randomUUID(), entities[2]!, entities[5]!, "e", tenantId);
      await projectFact(crypto.randomUUID(), entities[3]!, entities[6]!, "f", tenantId);

      const rootLevel = await repository.findConnectedEntities(entities[0]!, 1, tenantId);
      expect(rootLevel.ok, rootLevel.ok ? "" : rootLevel.error.message).toBe(true);
      if (!rootLevel.ok) throw rootLevel.error;
      expect(rootLevel.value.length).toBe(2);

      const subtree = await repository.traverse(
        { seedEntityIds: [entities[1]!], maxDepth: 2 },
        tenantId,
      );
      expect(subtree.ok, subtree.ok ? "" : subtree.error.message).toBe(true);
      if (!subtree.ok) throw subtree.error;
      expect(subtree.value.length).toBe(3);
    });
  });

  describe.skip("Tenant isolation", () => {
    it("prevents cross-tenant traversal", async () => {
      const [a, b, c] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      await createEntity(a, tenantId);
      await createEntity(b, tenantId);
      await createEntity(c, tenantIdB);
      await projectFact(crypto.randomUUID(), a, b, "rel", tenantId);
      await projectFact(crypto.randomUUID(), b, c, "rel_cross", tenantIdB);

      const sameTenant = await repository.findConnectedEntities(a, 2, tenantId);
      expect(sameTenant.ok, sameTenant.ok ? "" : sameTenant.error.message).toBe(true);
      if (!sameTenant.ok) throw sameTenant.error;
      expect(sameTenant.value.some((e) => e.entityId === b)).toBe(true);
      expect(sameTenant.value.some((e) => e.entityId === c)).toBe(false);
    });

    it.skip("isolates fact projections by tenant", async () => {
      const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
      const [c, d] = [crypto.randomUUID(), crypto.randomUUID()];
      await createEntity(a, tenantId);
      await createEntity(b, tenantId);
      await createEntity(c, tenantIdB);
      await createEntity(d, tenantIdB);
      await projectFact(crypto.randomUUID(), a, b, "rel", tenantId);
      await projectFact(crypto.randomUUID(), c, d, "rel", tenantIdB);

      const sameTenantConn = await repository.findConnectedEntities(a, 1, tenantId);
      expect(sameTenantConn.ok, sameTenantConn.ok ? "" : sameTenantConn.error.message).toBe(true);
      if (!sameTenantConn.ok) throw sameTenantConn.error;
      expect(sameTenantConn.value.some((e) => e.entityId === b)).toBe(true);

      const crossTenantConn = await repository.findConnectedEntities(a, 1, tenantIdB);
      expect(crossTenantConn.ok, crossTenantConn.ok ? "" : crossTenantConn.error.message).toBe(
        true,
      );
      if (!crossTenantConn.ok) throw crossTenantConn.error;
      expect(crossTenantConn.value).toHaveLength(0);
    });
  });
});
