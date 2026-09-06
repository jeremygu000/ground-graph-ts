import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSION } from "../../../src/infrastructure/postgres/vector-index";
import { PostgresVectorIndexAdapter } from "../../../src/infrastructure/postgres/vector-index";
import { PostgresFullTextSearchAdapter } from "../../../src/infrastructure/postgres/fulltext-index";
import { PostgresVectorIndexRepository } from "../../../src/infrastructure/postgres/index-repository";

function selectDb(rows: unknown[], reject = false) {
  const chain = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() =>
      reject ? Promise.reject(new Error("database unavailable")) : Promise.resolve(rows),
    ),
  };
  return { drizzle: { select: vi.fn(() => chain) } } as never;
}

describe("postgres vector index adapter validation", () => {
  it("rejects mismatched chunks and embeddings count", async () => {
    const adapter = new PostgresVectorIndexAdapter({} as never);
    const chunks = [
      {
        id: "chunk-1",
        documentVersionId: "docver-1",
        tenantId: "tenant-1",
        principalId: "principal-1",
        sequenceNumber: 0,
        content: "hello",
        contentHash: "hash",
        locator: { type: "line" as const, path: "doc.md" },
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const result = await adapter.upsertEmbeddings(chunks, [[0.1, 0.2]], "idx-1", "tenant-1");

    expect(result.ok).toBe(false);
  });

  it("rejects invalid embedding dimension", async () => {
    const adapter = new PostgresVectorIndexAdapter({} as never);
    const chunks = [
      {
        id: "chunk-1",
        documentVersionId: "docver-1",
        tenantId: "tenant-1",
        principalId: "principal-1",
        sequenceNumber: 0,
        content: "hello",
        contentHash: "hash",
        locator: { type: "line" as const, path: "doc.md" },
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    ];

    const result = await adapter.upsertEmbeddings(chunks, [[0.1, 0.2, 0.3]], "idx-1", "tenant-1");

    expect(result.ok).toBe(false);
  });

  it("rejects query with wrong embedding dimension", async () => {
    const adapter = new PostgresVectorIndexAdapter({} as never);
    const result = await adapter.search([0.1, 0.2], "tenant-1", {
      indexVersionId: "idx-1",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects search without index version id", async () => {
    const adapter = new PostgresVectorIndexAdapter({} as never);
    const queryEmbedding = Array(EMBEDDING_DIMENSION).fill(0.1);
    const result = await adapter.search(queryEmbedding, "tenant-1", {
      indexVersionId: "",
    });

    expect(result.ok).toBe(false);
  });

  it("maps vector search rows and handles database failures", async () => {
    const db = selectDb([
      {
        chunkId: "chunk-1",
        documentVersionId: "version-1",
        documentId: "document-1",
        content: "hello",
        locator: { type: "line", path: "doc.md" },
        metadata: { section: "intro" },
        score: 1.4,
        indexVersionId: "index-1",
      },
    ]);
    const adapter = new PostgresVectorIndexAdapter(db);
    const queryEmbedding = Array(EMBEDDING_DIMENSION).fill(0.1);
    await expect(
      adapter.search(queryEmbedding, "tenant-1", {
        indexVersionId: "index-1",
        limit: 0,
        minScore: 0.2,
        filter: {
          documentIds: ["document-1"],
          chunkIds: ["chunk-1"],
          principalId: ["principal-1"],
        },
      }),
    ).resolves.toEqual({
      ok: true,
      value: [expect.objectContaining({ chunkId: "chunk-1", score: 1 })],
    });

    const failed = new PostgresVectorIndexAdapter(selectDb([], true));
    await expect(
      failed.search(queryEmbedding, "tenant-1", { indexVersionId: "index-1" }),
    ).resolves.toMatchObject({
      ok: false,
    });
  });

  it("upserts vector embeddings and maps empty deletes", async () => {
    const chain = {
      values: vi.fn(() => chain),
      onConflictDoUpdate: vi.fn(() => Promise.resolve({ rowCount: 1 })),
    };
    const db = {
      drizzle: {
        insert: vi.fn(() => chain),
        select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })) })),
      },
    } as never;
    const chunk = {
      id: "chunk-1",
      documentVersionId: "version-1",
      tenantId: "tenant-1",
      principalId: "principal-1",
      sequenceNumber: 0,
      content: "hello",
      contentHash: "hash",
      locator: { type: "line" as const, path: "doc.md" },
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    const adapter = new PostgresVectorIndexAdapter(db);
    const embedding = Array(EMBEDDING_DIMENSION).fill(0.1);
    await expect(
      adapter.upsertEmbeddings([chunk], [embedding], "index-1", "tenant-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: { upserted: 1 },
    });
    await expect(adapter.deleteByDocumentVersion("version-1", "tenant-1")).resolves.toEqual({
      ok: true,
      value: { deleted: 0 },
    });
  });

  it("covers active index lookup, embedding failures, and deletion", async () => {
    const row = {
      id: "index-1",
      tenantId: "tenant-1",
      versionNumber: 3,
      embeddingModel: "model",
      embeddingDimension: EMBEDDING_DIMENSION,
      isActive: true,
    };
    await expect(
      new PostgresVectorIndexAdapter(selectDb([row])).getActiveIndexVersion("tenant-1"),
    ).resolves.toMatchObject({ ok: true, value: { indexVersionId: "index-1" } });
    await expect(
      new PostgresVectorIndexAdapter(selectDb([])).getActiveIndexVersion("tenant-1"),
    ).resolves.toEqual({ ok: true, value: null });
    await expect(
      new PostgresVectorIndexAdapter(selectDb([], true)).getActiveIndexVersion("tenant-1"),
    ).resolves.toMatchObject({ ok: false });

    const chunk = {
      id: "chunk-1",
      documentVersionId: "version-1",
      tenantId: "tenant-1",
      principalId: "p",
      sequenceNumber: 0,
      content: "x",
      contentHash: "h",
      locator: { type: "line" as const, path: "doc" },
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    const failingInsert = {
      values: vi.fn(() => failingInsert),
      onConflictDoUpdate: vi.fn(() => Promise.reject(new Error("insert failed"))),
    };
    await expect(
      new PostgresVectorIndexAdapter({
        drizzle: { insert: vi.fn(() => failingInsert) },
      } as never).upsertEmbeddings(
        [chunk],
        [Array(EMBEDDING_DIMENSION).fill(0)],
        "idx",
        "tenant-1",
      ),
    ).resolves.toMatchObject({ ok: false });

    const deleteChain = {
      from: vi.fn(() => deleteChain),
      where: vi.fn(() => Promise.resolve([{ id: "chunk-1" }])),
    };
    const deleteResult = { rowCount: 1 };
    const db = {
      drizzle: {
        select: vi.fn(() => deleteChain),
        delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(deleteResult)) })),
      },
    } as never;
    await expect(
      new PostgresVectorIndexAdapter(db).deleteByDocumentVersion("version-1", "tenant-1"),
    ).resolves.toEqual({ ok: true, value: { deleted: 1 } });
  });
});

describe("postgres fulltext search adapter validation", () => {
  it("rejects empty query", async () => {
    const adapter = new PostgresFullTextSearchAdapter({} as never);
    const result = await adapter.search("", "tenant-1", { limit: 10 });

    expect(result.ok).toBe(false);
  });

  it("maps full-text rows, clamps limits, and handles failures", async () => {
    const db = selectDb([
      {
        chunkId: "chunk-1",
        documentVersionId: "version-1",
        documentId: "document-1",
        content: "hello world",
        locator: { type: "line", path: "doc.md" },
        metadata: { section: "intro" },
        rank: 2,
        headline: "<b>hello</b> world",
      },
      {
        chunkId: "chunk-2",
        documentVersionId: "version-1",
        documentId: "document-1",
        content: "fallback",
        locator: null,
        metadata: null,
        rank: 0,
        headline: null,
      },
    ]);
    const adapter = new PostgresFullTextSearchAdapter(db);
    await expect(
      adapter.search("hello world", "tenant-1", {
        limit: 1000,
        language: "simple",
        filter: {
          documentIds: ["document-1"],
          chunkIds: ["chunk-1"],
          principalId: ["principal-1"],
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        expect.objectContaining({ score: 1, headline: "<b>hello</b> world" }),
        expect.objectContaining({ score: 0, headline: "fallback" }),
      ],
    });
    const failed = new PostgresFullTextSearchAdapter(selectDb([], true));
    await expect(failed.search("hello", "tenant-1", { limit: 10 })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("rebuilds the full-text index and reports rebuild failures", async () => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => Promise.resolve([{ id: "a" }, { id: "b" }])),
    };
    await expect(
      new PostgresFullTextSearchAdapter({
        drizzle: { select: vi.fn(() => chain) },
      } as never).rebuildIndex("tenant-1", []),
    ).resolves.toEqual({ ok: true, value: { rebuilt: 2 } });
    const failed = { from: vi.fn(() => ({ where: vi.fn(() => Promise.reject(new Error("db"))) })) };
    await expect(
      new PostgresFullTextSearchAdapter({
        drizzle: { select: vi.fn(() => failed) },
      } as never).rebuildIndex("tenant-1", []),
    ).resolves.toMatchObject({ ok: false });
  });

  it("returns no rows when tokenization produces no tsquery", async () => {
    const adapter = new PostgresFullTextSearchAdapter({} as never);
    await expect(adapter.search("a !", "tenant-1", { limit: 10 })).resolves.toEqual({
      ok: true,
      value: [],
    });
  });
});

describe("postgres vector index repository", () => {
  const info = {
    tenantId: "tenant-1",
    versionNumber: 2,
    embeddingModel: "text-embedding",
    embeddingDimension: EMBEDDING_DIMENSION,
    isActive: true,
  };

  it("deactivates the previous version and returns the inserted version", async () => {
    const updateChain = { set: vi.fn(() => updateChain), where: vi.fn(() => Promise.resolve()) };
    const insertChain = {
      values: vi.fn(() => insertChain),
      returning: vi.fn(() => Promise.resolve([{ id: "index-2", ...info }])),
    };
    const db = {
      drizzle: { update: vi.fn(() => updateChain), insert: vi.fn(() => insertChain) },
    } as never;
    const result = await new PostgresVectorIndexRepository(db).activateIndexVersion(info);
    expect(result).toMatchObject({
      ok: true,
      value: { indexVersionId: "index-2", versionNumber: 2 },
    });
    expect(updateChain.set).toHaveBeenCalled();
  });

  it("fails when insert returning is empty", async () => {
    const updateChain = { set: vi.fn(() => updateChain), where: vi.fn(() => Promise.resolve()) };
    const insertChain = {
      values: vi.fn(() => insertChain),
      returning: vi.fn(() => Promise.resolve([])),
    };
    const db = {
      drizzle: { update: vi.fn(() => updateChain), insert: vi.fn(() => insertChain) },
    } as never;
    await expect(
      new PostgresVectorIndexRepository(db).activateIndexVersion(info),
    ).resolves.toMatchObject({ ok: false });
  });

  it("loads, returns null, and reports errors for the active version", async () => {
    const row = { id: "index-1", ...info, versionNumber: 1 };
    await expect(
      new PostgresVectorIndexRepository(selectDb([row])).getActiveIndexVersion("tenant-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: { indexVersionId: "index-1", versionNumber: 1 },
    });
    await expect(
      new PostgresVectorIndexRepository(selectDb([])).getActiveIndexVersion("tenant-1"),
    ).resolves.toEqual({ ok: true, value: null });
    await expect(
      new PostgresVectorIndexRepository(selectDb([], true)).getActiveIndexVersion("tenant-1"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("falls back to empty model and dimension when legacy rows omit them", async () => {
    const row = {
      id: "index-legacy",
      ...info,
      embeddingModel: null,
      embeddingDimension: null,
    };
    await expect(
      new PostgresVectorIndexRepository(selectDb([row])).getActiveIndexVersion("tenant-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: { embeddingModel: "", embeddingDimension: 0 },
    });
  });
});
