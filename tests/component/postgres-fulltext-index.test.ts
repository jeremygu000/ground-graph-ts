import { afterAll, beforeAll, describe, expect, it, beforeEach } from "vitest";
import {
  chunks,
  documents,
  documentVersions,
  sources,
} from "../../src/infrastructure/postgres/schema";
import {
  PostgresFullTextSearchAdapter,
  buildTsQuery,
  sanitize,
  clamp,
} from "../../src/infrastructure/postgres/fulltext-index";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";

await assertContainerRuntime();

describe("PostgresFullTextSearchAdapter", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let fulltextIndex: PostgresFullTextSearchAdapter;

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    fulltextIndex = new PostgresFullTextSearchAdapter(ctx.db);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  beforeEach(async () => {
    await ctx.db.client.unsafe(
      "TRUNCATE TABLE chunks, document_versions, documents, sources RESTART IDENTITY CASCADE",
    );
  });

  async function createTestData(tenantId: string, principalId: string, content: string) {
    const sourceId = crypto.randomUUID();
    const docId = crypto.randomUUID();
    const docVersionId = crypto.randomUUID();
    const chunkId = crypto.randomUUID();

    await ctx.db.drizzle.insert(sources).values({
      id: sourceId,
      tenantId,
      principalId,
      type: "url" as const,
      uri: `https://example.com/test/${sourceId}`,
    });

    await ctx.db.drizzle.insert(documents).values({
      id: docId,
      tenantId,
      principalId,
      sourceId,
      title: "Test Doc",
    });

    await ctx.db.drizzle.insert(documentVersions).values({
      id: docVersionId,
      documentId: docId,
      tenantId,
      principalId,
      versionNumber: 1,
      contentHash: "hash",
      checksum: "checksum",
      sizeBytes: 1,
    });

    await ctx.db.drizzle.insert(chunks).values({
      id: chunkId,
      documentVersionId: docVersionId,
      tenantId,
      principalId,
      sequenceNumber: 0,
      content,
      contentHash: "chash",
      locator: { type: "line" as const, path: "/" },
    });

    return { sourceId, docId, docVersionId, chunkId };
  }

  describe("search", () => {
    it("returns empty results for unauthorized tenant", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "The capital of France is Paris");

      const result = await fulltextIndex.search("France", crypto.randomUUID(), {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it("finds content matching full-text query", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { chunkId } = await createTestData(
        tenantId,
        principalId,
        "The capital of France is Paris",
      );

      const result = await fulltextIndex.search("France", tenantId, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0]?.chunkId).toBe(chunkId);
      }
    });

    it("returns failure for empty query", async () => {
      const tenantId = crypto.randomUUID();
      const result = await fulltextIndex.search("", tenantId, {});
      expect(result.ok).toBe(false);
    });

    it("returns failure for whitespace-only query", async () => {
      const tenantId = crypto.randomUUID();
      const result = await fulltextIndex.search("   ", tenantId, {});
      expect(result.ok).toBe(false);
    });

    it("respects limit option", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "apple fruit");
      await createTestData(tenantId, principalId, "banana fruit");
      await createTestData(tenantId, principalId, "cherry fruit");

      const result = await fulltextIndex.search("fruit", tenantId, { limit: 2 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(2);
      }
    });

    it("filters by principalId", async () => {
      const tenantId = crypto.randomUUID();
      const principalId1 = crypto.randomUUID();
      const principalId2 = crypto.randomUUID();
      await createTestData(tenantId, principalId1, "secret information");
      await createTestData(tenantId, principalId2, "public information");

      const result = await fulltextIndex.search("information", tenantId, {
        filter: { principalId: [principalId1] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
      }
    });

    it("filters by documentIds", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { docId: docId1 } = await createTestData(tenantId, principalId, "document one");
      await createTestData(tenantId, principalId, "document two");

      const result = await fulltextIndex.search("document", tenantId, {
        filter: { documentIds: [docId1] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
      }
    });

    it("filters by chunkIds", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { chunkId: chunkId1 } = await createTestData(tenantId, principalId, "chunk one");
      await createTestData(tenantId, principalId, "chunk two");

      const result = await fulltextIndex.search("chunk", tenantId, {
        filter: { chunkIds: [chunkId1] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1);
        expect(result.value[0]?.chunkId).toBe(chunkId1);
      }
    });

    it("returns results with headline", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "The capital of France is Paris");

      const result = await fulltextIndex.search("France", tenantId, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0]?.headline).toBeDefined();
      }
    });

    it("returns empty for query with no matches", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "The capital of France is Paris");

      const result = await fulltextIndex.search("Germany", tenantId, {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it("supports different languages", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "Le capital de la France est Paris");

      const result = await fulltextIndex.search("France", tenantId, { language: "french" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
      }
    });
  });

  describe("rebuildIndex", () => {
    it("rebuilds index for tenant", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "content one");
      await createTestData(tenantId, principalId, "content two");

      const result = await fulltextIndex.rebuildIndex(tenantId, []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rebuilt).toBe(2);
      }
    });

    it("returns zero rebuilt when no chunks exist", async () => {
      const tenantId = crypto.randomUUID();
      const result = await fulltextIndex.rebuildIndex(tenantId, []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.rebuilt).toBe(0);
      }
    });
  });
});

describe("buildTsQuery", () => {
  it("builds query from multiple tokens", () => {
    const result = buildTsQuery("capital of france", "english");
    expect(result).toBe("capital & of & france");
  });

  it("returns empty string for single character tokens", () => {
    const result = buildTsQuery("a b c", "english");
    expect(result).toBe("");
  });

  it("sanitizes input", () => {
    const result = buildTsQuery("Test@123!", "english");
    expect(result).toBe("test & 123");
  });
});

describe("sanitize", () => {
  it("removes non-alphanumeric characters", () => {
    expect(sanitize("Hello-World_123")).toBe("helloworld123");
  });

  it("converts to lowercase", () => {
    expect(sanitize("TEST")).toBe("test");
  });
});

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("returns min when value is below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("returns max when value is above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});
