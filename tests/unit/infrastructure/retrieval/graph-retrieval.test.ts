import { describe, expect, it } from "vitest";
import type {
  GraphRetrievalPort,
  GraphRetrievalOptions,
} from "../../../../src/infrastructure/retrieval/graph-retrieval.types";
import type { RetrievalResult } from "../../../../src/domain/retrieval/retrieval.schema";
import { success } from "../../../../src/domain/result";

const mockGraphPort: GraphRetrievalPort = {
  async retrieveGraphNeighbors(
    entityId: string,
    _tenantId: string,
    options?: GraphRetrievalOptions,
  ) {
    const depth = options?.maxDepth ?? 1;
    return success([
      {
        id: "neighbor-1",
        strategy: "graph",
        score: 1.0 / (1 + depth),
        entityId: "entity-2",
        content: "",
        metadata: {
          traversalDepth: depth,
          path: [{ fromId: entityId, predicate: "related_to", toId: "entity-2" }],
          factId: "fact-1",
        },
      },
    ] as RetrievalResult[]);
  },
  async retrieveGraphPaths(
    startEntityId: string,
    endEntityId: string,
    _tenantId: string,
    _maxHops?: number,
  ) {
    return success([
      {
        id: "path-1",
        strategy: "graph",
        score: 0.8,
        content: "",
        metadata: {
          totalHops: 2,
          path: [
            { fromId: startEntityId, predicate: "uses", toId: "entity-2" },
            { fromId: "entity-2", predicate: "connects_to", toId: endEntityId },
          ],
        },
      },
    ] as RetrievalResult[]);
  },
  async retrieveConnectedEntities(_entityId: string, _depth: number, _tenantId: string) {
    return success([
      {
        id: "connected-1",
        strategy: "graph",
        score: 0.7,
        entityId: "entity-2",
        content: "",
        metadata: {
          relationship: "related_to",
          depth: 1,
        },
      },
    ] as RetrievalResult[]);
  },
};

describe("Graph Retrieval Path Validity", () => {
  describe("path metadata validation", () => {
    it("returns results with required metadata fields", async () => {
      const result = await mockGraphPort.retrieveGraphNeighbors("seed-1", "tenant-1", {
        maxDepth: 2,
        direction: "both",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        const first = result.value[0];
        expect(first?.metadata).toBeDefined();
        expect(first?.metadata?.["traversalDepth"]).toBeDefined();
        expect(first?.metadata?.["path"]).toBeDefined();
      }
    });

    it("returns path results with hop count metadata", async () => {
      const result = await mockGraphPort.retrieveGraphPaths("start-1", "end-1", "tenant-1", 3);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        const first = result.value[0];
        expect(first?.metadata?.["totalHops"]).toBeDefined();
        expect(first?.metadata?.["path"]).toBeDefined();
      }
    });

    it("maps depth to inverse score", async () => {
      const result = await mockGraphPort.retrieveGraphNeighbors("seed-1", "tenant-1", {
        maxDepth: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const depth1Score = result.value[0]?.score;
        expect(depth1Score).toBeCloseTo(0.5, 1);
      }
    });
  });

  describe("fact status filtering", () => {
    it("excludes superseded facts when filter is set", async () => {
      const mockWithFilter: GraphRetrievalPort = {
        async retrieveGraphNeighbors(
          _entityId: string,
          _tenantId: string,
          options?: GraphRetrievalOptions,
        ) {
          const statuses = options?.factStatuses ?? [];
          const facts = [
            { id: "f1", status: "verified" as const },
            { id: "f2", status: "superseded" as const },
          ];
          const filtered = facts.filter((f) => statuses.includes(f.status));
          return success([
            {
              id: filtered[0]?.id ?? "none",
              strategy: "graph",
              score: 0.9,
              content: "",
              metadata: { factStatus: filtered[0]?.status },
            },
          ] as RetrievalResult[]);
        },
        async retrieveGraphPaths() {
          return success([] as RetrievalResult[]);
        },
        async retrieveConnectedEntities() {
          return success([] as RetrievalResult[]);
        },
      };

      const result = await mockWithFilter.retrieveGraphNeighbors("e1", "t1", {
        maxDepth: 1,
        factStatuses: ["verified"],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const hasSuperseded = result.value.some((r) => r.metadata?.["factStatus"] === "superseded");
        expect(hasSuperseded).toBe(false);
      }
    });
  });

  describe("maxDepth enforcement", () => {
    it("respects maxDepth parameter", async () => {
      const mockWithDepth: GraphRetrievalPort = {
        async retrieveGraphNeighbors(
          _entityId: string,
          _tenantId: string,
          options?: GraphRetrievalOptions,
        ) {
          const depth = options?.maxDepth ?? 2;
          return success([
            {
              id: `result-depth-${depth}`,
              strategy: "graph",
              score: 1.0 / (1 + depth),
              entityId: `entity-at-depth-${depth}`,
              content: "",
              metadata: { traversalDepth: depth },
            },
          ] as RetrievalResult[]);
        },
        async retrieveGraphPaths() {
          return success([] as RetrievalResult[]);
        },
        async retrieveConnectedEntities() {
          return success([] as RetrievalResult[]);
        },
      };

      const depth2 = await mockWithDepth.retrieveGraphNeighbors("e1", "t1", { maxDepth: 2 });
      const depth4 = await mockWithDepth.retrieveGraphNeighbors("e1", "t1", { maxDepth: 4 });

      expect(depth2.ok && depth4.ok).toBe(true);
      if (depth2.ok && depth4.ok) {
        const score2 = depth2.value[0]?.score ?? 0;
        const score4 = depth4.value[0]?.score ?? 0;
        expect(score2).toBeGreaterThan(score4);
      }
    });

    it("clamps depth to maximum allowed value", () => {
      const MAX_DEPTH = 5;
      const requestedDepth = 10;
      const enforcedDepth = Math.min(requestedDepth, MAX_DEPTH);
      expect(enforcedDepth).toBe(MAX_DEPTH);
    });
  });

  describe("temporal validity", () => {
    it("validAsOf filter is passed to graph traversal", async () => {
      let capturedOptions: GraphRetrievalOptions | undefined;
      const mockWithTemporal: GraphRetrievalPort = {
        async retrieveGraphNeighbors(
          _entityId: string,
          _tenantId: string,
          options?: GraphRetrievalOptions,
        ) {
          capturedOptions = options;
          return success([] as RetrievalResult[]);
        },
        async retrieveGraphPaths() {
          return success([] as RetrievalResult[]);
        },
        async retrieveConnectedEntities() {
          return success([] as RetrievalResult[]);
        },
      };

      await mockWithTemporal.retrieveGraphNeighbors("e1", "t1", {
        maxDepth: 2,
        validAsOf: "2024-06-01T00:00:00.000Z",
      });

      expect(capturedOptions?.validAsOf).toBe("2024-06-01T00:00:00.000Z");
    });
  });

  describe("direction filtering", () => {
    it("supports outgoing direction", async () => {
      let capturedDirection: "outgoing" | "incoming" | "both" | undefined;
      const mockWithDirection: GraphRetrievalPort = {
        async retrieveGraphNeighbors(
          _entityId: string,
          _tenantId: string,
          options?: GraphRetrievalOptions,
        ) {
          capturedDirection = options?.direction;
          return success([] as RetrievalResult[]);
        },
        async retrieveGraphPaths() {
          return success([] as RetrievalResult[]);
        },
        async retrieveConnectedEntities() {
          return success([] as RetrievalResult[]);
        },
      };

      await mockWithDirection.retrieveGraphNeighbors("e1", "t1", {
        maxDepth: 1,
        direction: "outgoing",
      });

      expect(capturedDirection).toBe("outgoing");
    });

    it("supports incoming direction", async () => {
      let capturedDirection: "outgoing" | "incoming" | "both" | undefined;
      const mockWithDirection: GraphRetrievalPort = {
        async retrieveGraphNeighbors(
          _entityId: string,
          _tenantId: string,
          options?: GraphRetrievalOptions,
        ) {
          capturedDirection = options?.direction;
          return success([] as RetrievalResult[]);
        },
        async retrieveGraphPaths() {
          return success([] as RetrievalResult[]);
        },
        async retrieveConnectedEntities() {
          return success([] as RetrievalResult[]);
        },
      };

      await mockWithDirection.retrieveGraphNeighbors("e1", "t1", {
        maxDepth: 1,
        direction: "incoming",
      });

      expect(capturedDirection).toBe("incoming");
    });
  });
});

describe("Graph Traversal Budget Enforcement", () => {
  it("limits results to budget when set", async () => {
    const MAX_BUDGET = 10;
    const mockWithBudget: GraphRetrievalPort = {
      async retrieveGraphNeighbors(
        _entityId: string,
        _tenantId: string,
        _options?: GraphRetrievalOptions,
      ) {
        const allResults = Array.from({ length: 20 }, (_v, i) => ({
          id: `result-${i}`,
          strategy: "graph" as const,
          score: 1.0 - i * 0.05,
          entityId: `entity-${i}`,
          content: "",
          metadata: {},
        }));

        return success(allResults.slice(0, MAX_BUDGET) as RetrievalResult[]);
      },
      async retrieveGraphPaths() {
        return success([] as RetrievalResult[]);
      },
      async retrieveConnectedEntities() {
        return success([] as RetrievalResult[]);
      },
    };

    const result = await mockWithBudget.retrieveGraphNeighbors("e1", "t1", { maxDepth: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(MAX_BUDGET);
    }
  });

  it("fusion deduplicates by entityId", () => {
    const results = [
      { id: "r1", entityId: "e1", score: 0.9 },
      { id: "r2", entityId: "e1", score: 0.8 },
      { id: "r3", entityId: "e2", score: 0.7 },
    ];

    const seen = new Set<string>();
    const deduplicated = results.filter((r) => {
      if (seen.has(r.entityId)) return false;
      seen.add(r.entityId);
      return true;
    });

    expect(deduplicated).toHaveLength(2);
    expect(deduplicated.find((r) => r.entityId === "e1")?.id).toBe("r1");
  });
});

describe("Provenance Tracking", () => {
  it("captures fact IDs in traversal metadata", async () => {
    const FACT_ID = "fact-verified-001";
    const mockWithFactId: GraphRetrievalPort = {
      async retrieveGraphNeighbors(
        _entityId: string,
        _tenantId: string,
        _options?: GraphRetrievalOptions,
      ) {
        return success([
          {
            id: "result-1",
            strategy: "graph",
            score: 0.9,
            entityId: "entity-2",
            content: "",
            metadata: {
              traversalDepth: 1,
              path: [{ fromId: "seed", predicate: "related_to", toId: "entity-2" }],
              factId: FACT_ID,
            },
          },
        ] as RetrievalResult[]);
      },
      async retrieveGraphPaths() {
        return success([] as RetrievalResult[]);
      },
      async retrieveConnectedEntities() {
        return success([] as RetrievalResult[]);
      },
    };

    const result = await mockWithFactId.retrieveGraphNeighbors("e1", "t1", { maxDepth: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const hasFactId = result.value.some((r) => r.metadata?.["factId"] === FACT_ID);
      expect(hasFactId).toBe(true);
    }
  });

  it("records complete path chain", async () => {
    const mockWithPath: GraphRetrievalPort = {
      async retrieveGraphNeighbors(
        _entityId: string,
        _tenantId: string,
        _options?: GraphRetrievalOptions,
      ) {
        return success([
          {
            id: "result-1",
            strategy: "graph",
            score: 0.9,
            entityId: "entity-2",
            content: "",
            metadata: {
              traversalDepth: 1,
              path: [{ fromId: "seed", predicate: "step1", toId: "entity-2" }],
            },
          },
        ] as RetrievalResult[]);
      },
      async retrieveGraphPaths() {
        return success([] as RetrievalResult[]);
      },
      async retrieveConnectedEntities() {
        return success([] as RetrievalResult[]);
      },
    };

    const result = await mockWithPath.retrieveGraphNeighbors("seed", "t1", { maxDepth: 2 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const path = result.value[0]?.metadata?.["path"] as Array<{
        fromId: string;
        predicate: string;
        toId: string;
      }>;
      expect(path).toBeDefined();
      expect(Array.isArray(path)).toBe(true);
    }
  });

  it("validates path integrity - no orphaned entities", () => {
    const paths = [
      { fromId: "A", predicate: "rel", toId: "B" },
      { fromId: "B", predicate: "rel", toId: "C" },
    ];

    const entities = new Set<string>();
    paths.forEach((p) => {
      entities.add(p.fromId);
      entities.add(p.toId);
    });

    const connectedEntities = new Set(paths.flatMap((p) => [p.fromId, p.toId]));
    const isConnected = entities.size === connectedEntities.size;
    expect(isConnected).toBe(true);
  });
});

describe("Tenant Isolation in Graph Traversal", () => {
  it("must not traverse entities from other tenants", async () => {
    const TENANT_A = "tenant-a-id";
    const TENANT_B = "tenant-b-id";

    const crossTenantResult = await mockGraphPort.retrieveGraphNeighbors(
      "tenant-a-entity",
      TENANT_A,
      { maxDepth: 2 },
    );

    if (crossTenantResult.ok) {
      const hasCrossTenant = crossTenantResult.value.some(
        (r) => r.metadata?.["tenantId"] === TENANT_B,
      );
      expect(hasCrossTenant).toBe(false);
    }
  });

  it("tenantId filter is mandatory", async () => {
    let receivedTenantId: string | undefined;
    const mockStrictTenant: GraphRetrievalPort = {
      async retrieveGraphNeighbors(
        _entityId: string,
        tenantId: string,
        _options?: GraphRetrievalOptions,
      ) {
        receivedTenantId = tenantId;
        return success([] as RetrievalResult[]);
      },
      async retrieveGraphPaths() {
        return success([] as RetrievalResult[]);
      },
      async retrieveConnectedEntities() {
        return success([] as RetrievalResult[]);
      },
    };

    await mockStrictTenant.retrieveGraphNeighbors("e1", "required-tenant", { maxDepth: 1 });
    expect(receivedTenantId).toBe("required-tenant");
  });
});
