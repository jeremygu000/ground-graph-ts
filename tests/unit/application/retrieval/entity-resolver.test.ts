import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DefaultEntityResolver,
  type EntityRepositoryPort,
} from "@/application/retrieval/entity-resolver";

describe("DefaultEntityResolver", () => {
  let resolver: DefaultEntityResolver;
  let mockRepository: EntityRepositoryPort;
  let mockClock: () => Date;

  beforeEach(() => {
    mockClock = () => new Date("2024-01-01T00:00:00Z");
    mockRepository = {
      findByCanonicalName: vi.fn(),
      findByAlias: vi.fn(),
      searchEntities: vi.fn(),
    };
    resolver = new DefaultEntityResolver({
      entityRepository: mockRepository,
      clock: mockClock,
    });
  });

  describe("extractEntityMentions", () => {
    it("extracts capitalized multi-word entities", () => {
      const mentions = resolver.extractEntityMentions(
        "How does UserService interact with PaymentAPI?",
      );
      expect(mentions.some((m) => m.text === "UserService")).toBe(true);
      expect(mentions.some((m) => m.text === "PaymentAPI")).toBe(true);
    });

    it("extracts underscored identifiers", () => {
      const mentions = resolver.extractEntityMentions(
        "The user_auth_service handles authentication",
      );
      expect(mentions.some((m) => m.text === "user_auth_service")).toBe(true);
    });

    it("ignores common words", () => {
      const mentions = resolver.extractEntityMentions("What is the The service?");
      expect(mentions.some((m) => m.text === "The")).toBe(false);
      expect(mentions.some((m) => m.text === "is")).toBe(false);
    });

    it("returns empty for short text", () => {
      const mentions = resolver.extractEntityMentions("ab bc cd");
      expect(mentions).toHaveLength(0);
    });
  });

  describe("resolveEntitiesFromQuery", () => {
    it("selects full-text and default hybrid plans", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValue({
        ok: true,
        value: [{ id: "e1", canonicalName: "Acme", entityType: "service", score: 0.9 }],
      });
      const fulltext = await resolver.resolveEntitiesFromQuery("find Acme", "tenant-1");
      expect(fulltext).toMatchObject({ ok: true, value: { queryPlan: { strategy: "fulltext" } } });
      const hybrid = await resolver.resolveEntitiesFromQuery("Explain Acme", "tenant-1");
      expect(hybrid).toMatchObject({
        ok: true,
        value: { queryPlan: { strategy: "hybrid", budget: { graphResults: 20 } } },
      });
    });

    it("handles repository exceptions", async () => {
      vi.mocked(mockRepository.searchEntities).mockRejectedValue(new Error("boom"));
      expect(await resolver.resolveEntitiesFromQuery("Acme", "tenant-1")).toMatchObject({
        ok: false,
      });
    });
    it("returns empty entities for query without mentions", async () => {
      const result = await resolver.resolveEntitiesFromQuery("What is the weather?", "tenant-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entities).toHaveLength(0);
        expect(result.value.queryPlan.strategy).toBe("vector");
      }
    });

    it("resolves entities from query", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValueOnce({
        ok: true,
        value: [
          { id: "entity-1", canonicalName: "UserService", entityType: "service", score: 0.9 },
        ],
      });

      const result = await resolver.resolveEntitiesFromQuery(
        "How does UserService work?",
        "tenant-1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entities).toHaveLength(1);
        expect(result.value.entities[0]?.entityId).toBe("entity-1");
        expect(result.value.entities[0]?.canonicalName).toBe("UserService");
      }
    });

    it("detects hybrid strategy for multi-entity queries", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValue({
        ok: true,
        value: [{ id: "entity-1", canonicalName: "ServiceA", entityType: "service", score: 0.9 }],
      });

      const result = await resolver.resolveEntitiesFromQuery(
        "How does ServiceA depend on ServiceB?",
        "tenant-1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.queryPlan.strategy).toBe("hybrid");
        expect(result.value.queryPlan.budget.graphResults).toBeGreaterThan(0);
      }
    });

    it("detects graph strategy for dependency keywords", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValue({
        ok: true,
        value: [{ id: "entity-1", canonicalName: "PaymentAPI", entityType: "service", score: 0.9 }],
      });

      const result = await resolver.resolveEntitiesFromQuery(
        "What services are downstream of PaymentAPI?",
        "tenant-1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.queryPlan.strategy).toBe("hybrid");
      }
    });

    it("returns vector strategy when no entities found", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValue({
        ok: true,
        value: [],
      });

      const result = await resolver.resolveEntitiesFromQuery("What is the weather?", "tenant-1");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entities).toHaveLength(0);
        expect(result.value.queryPlan.strategy).toBe("vector");
      }
    });

    it("handles repository errors gracefully", async () => {
      vi.mocked(mockRepository.searchEntities).mockResolvedValueOnce({
        ok: false,
        error: new Error("DB error"),
      });

      const result = await resolver.resolveEntitiesFromQuery(
        "How does UserService work?",
        "tenant-1",
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.entities).toHaveLength(0);
      }
    });
  });
});
