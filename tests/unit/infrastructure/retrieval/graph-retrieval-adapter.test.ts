import { describe, expect, it, vi, beforeEach } from "vitest";
import { DefaultGraphRetrievalAdapter } from "../../../../src/infrastructure/retrieval/graph-retrieval-adapter";
import type { GraphRetrievalDependencies } from "../../../../src/infrastructure/retrieval/graph-retrieval.types";
import type { GraphTraversalPort } from "../../../../src/application/retrieval/ports.types";

describe("DefaultGraphRetrievalAdapter", () => {
  let mockGraphPort: GraphTraversalPort;
  let adapter: DefaultGraphRetrievalAdapter;
  const mockIdGen = vi.fn(() => "test-id");
  const mockClock = vi.fn(() => new Date());

  beforeEach(() => {
    mockGraphPort = {
      traverse: vi.fn(),
      findPaths: vi.fn(),
      findConnectedEntities: vi.fn(),
    };

    const deps: GraphRetrievalDependencies = {
      graph: mockGraphPort,
      idGen: mockIdGen,
      clock: mockClock,
    };

    adapter = new DefaultGraphRetrievalAdapter(deps);
  });

  describe("retrieveGraphNeighbors", () => {
    it("returns traversal results as retrieval results", async () => {
      vi.mocked(mockGraphPort.traverse).mockResolvedValueOnce({
        ok: true,
        value: [
          {
            entityId: "entity-1",
            path: [{ fromId: "start", predicate: "SUBJECT_OF", toId: "entity-1" }],
            depth: 1,
            factId: "fact-1",
          },
        ],
      });

      const result = await adapter.retrieveGraphNeighbors("seed-1", "tenant-1", {
        maxDepth: 2,
        direction: "both",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.entityId).toBe("entity-1");
        expect(result.value[0]!.strategy).toBe("graph");
        expect(result.value[0]!.score).toBeCloseTo(0.5, 2);
      }
    });

    it("handles traverse errors", async () => {
      vi.mocked(mockGraphPort.traverse).mockResolvedValueOnce({
        ok: false,
        error: new Error("Graph error"),
      });

      const result = await adapter.retrieveGraphNeighbors("seed-1", "tenant-1");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("Graph error");
      }
    });

    it("omits validAsOf when not provided", async () => {
      vi.mocked(mockGraphPort.traverse).mockResolvedValueOnce({
        ok: true,
        value: [],
      });

      await adapter.retrieveGraphNeighbors("seed-1", "tenant-1", {
        maxDepth: 2,
      });

      expect(mockGraphPort.traverse).toHaveBeenCalledWith(
        expect.objectContaining({
          seedEntityIds: ["seed-1"],
          maxDepth: 2,
          direction: "both",
        }),
        "tenant-1",
      );
    });

    it("includes validAsOf when provided", async () => {
      vi.mocked(mockGraphPort.traverse).mockResolvedValueOnce({
        ok: true,
        value: [],
      });

      await adapter.retrieveGraphNeighbors("seed-1", "tenant-1", {
        maxDepth: 2,
        validAsOf: "2024-01-01Z",
      });

      expect(mockGraphPort.traverse).toHaveBeenCalledWith(
        expect.objectContaining({
          validAsOf: "2024-01-01Z",
        }),
        "tenant-1",
      );
    });
  });

  describe("retrieveGraphPaths", () => {
    it("returns path results as retrieval results", async () => {
      vi.mocked(mockGraphPort.findPaths).mockResolvedValueOnce({
        ok: true,
        value: [
          {
            path: [
              { fromId: "A", predicate: "SUBJECT_OF", toId: "B" },
              { fromId: "B", predicate: "SUBJECT_OF", toId: "C" },
            ],
            totalHops: 2,
          },
        ],
      });

      const result = await adapter.retrieveGraphPaths("A", "C", "tenant-1", 3);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]!.metadata?.["totalHops"]).toBe(2);
        expect(result.value[0]!.score).toBeCloseTo(0.333, 2);
      }
    });

    it("handles path finding errors", async () => {
      vi.mocked(mockGraphPort.findPaths).mockResolvedValueOnce({
        ok: false,
        error: new Error("Path error"),
      });

      const result = await adapter.retrieveGraphPaths("A", "C", "tenant-1");

      expect(result.ok).toBe(false);
    });

    it("uses default maxHops of 3", async () => {
      vi.mocked(mockGraphPort.findPaths).mockResolvedValueOnce({
        ok: true,
        value: [],
      });

      await adapter.retrieveGraphPaths("A", "C", "tenant-1");

      expect(mockGraphPort.findPaths).toHaveBeenCalledWith(
        expect.objectContaining({ maxHops: 3 }),
        "tenant-1",
      );
    });
  });

  describe("retrieveConnectedEntities", () => {
    it("returns connected entities as retrieval results", async () => {
      vi.mocked(mockGraphPort.findConnectedEntities).mockResolvedValueOnce({
        ok: true,
        value: [
          { entityId: "connected-1", relationship: "connected", depth: 1 },
          { entityId: "connected-2", relationship: "connected", depth: 2 },
        ],
      });

      const result = await adapter.retrieveConnectedEntities("entity-1", 2, "tenant-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.entityId).toBe("connected-1");
        expect(result.value[0]!.score).toBeCloseTo(0.5, 2);
        expect(result.value[1]!.score).toBeCloseTo(0.333, 2);
      }
    });

    it("handles errors", async () => {
      vi.mocked(mockGraphPort.findConnectedEntities).mockResolvedValueOnce({
        ok: false,
        error: new Error("Connection error"),
      });

      const result = await adapter.retrieveConnectedEntities("entity-1", 2, "tenant-1");

      expect(result.ok).toBe(false);
    });
  });
});
