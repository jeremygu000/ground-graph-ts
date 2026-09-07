import { describe, expect, it, vi } from "vitest";
import { EntityRepositoryAdapter } from "@/infrastructure/adapters/entity-repository-adapter";

describe("EntityRepositoryAdapter", () => {
  describe("findByCanonicalName", () => {
    it("returns error when repo returns error", async () => {
      const mockRepo = {
        findByCanonicalName: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("DB error"),
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.findByCanonicalName("TestEntity", "tenant-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("DB error");
    });

    it("returns empty array when repo returns null value", async () => {
      const mockRepo = {
        findByCanonicalName: vi.fn().mockResolvedValue({
          ok: true,
          value: null,
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.findByCanonicalName("TestEntity", "tenant-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([]);
    });

    it("returns mapped entity when repo returns value", async () => {
      const mockRepo = {
        findByCanonicalName: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "entity-1",
            canonicalName: "TestEntity",
            entityType: "service",
          },
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.findByCanonicalName("TestEntity", "tenant-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([
        {
          id: "entity-1",
          canonicalName: "TestEntity",
          entityType: "service",
        },
      ]);
    });
  });

  describe("findByAlias", () => {
    it("returns error when repo returns error", async () => {
      const mockRepo = {
        findByAlias: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("DB error"),
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.findByAlias("alias1", "tenant-1");

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("DB error");
    });

    it("returns mapped entities when repo returns values", async () => {
      const mockRepo = {
        findByAlias: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: "entity-1", canonicalName: "Entity1", entityType: "service" },
            { id: "entity-2", canonicalName: "Entity2", entityType: "module" },
          ],
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.findByAlias("alias1", "tenant-1");

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([
        { id: "entity-1", canonicalName: "Entity1", entityType: "service" },
        { id: "entity-2", canonicalName: "Entity2", entityType: "module" },
      ]);
    });
  });

  describe("searchEntities", () => {
    it("returns error when repo returns error", async () => {
      const mockRepo = {
        searchEntities: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("DB error"),
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.searchEntities("test", "tenant-1", 5);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.message).toBe("DB error");
    });

    it("returns results when repo returns success", async () => {
      const mockRepo = {
        searchEntities: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: "entity-1", canonicalName: "TestEntity", entityType: "service", score: 0.9 },
          ],
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      const result = await adapter.searchEntities("test", "tenant-1", 5);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual([
        { id: "entity-1", canonicalName: "TestEntity", entityType: "service", score: 0.9 },
      ]);
    });

    it("passes through limit to repo", async () => {
      const mockRepo = {
        searchEntities: vi.fn().mockResolvedValue({
          ok: true,
          value: [],
        }),
      } as any;

      const adapter = new EntityRepositoryAdapter(mockRepo);
      await adapter.searchEntities("test", "tenant-1", 10);

      expect(mockRepo.searchEntities).toHaveBeenCalledWith("test", "tenant-1", 10);
    });
  });
});
