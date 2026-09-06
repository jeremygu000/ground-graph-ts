import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chunks,
  documents,
  documentVersions,
  indexVersions,
  sources,
} from "../../src/infrastructure/postgres/schema";
import { PostgresVectorIndexAdapter } from "../../src/infrastructure/postgres/vector-index";
import { deterministicLocalEmbedding } from "../../src/infrastructure/models/embedding-adapter";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";
import type { Chunk } from "../../src/domain/documents/types";

await assertContainerRuntime();

describe("PostgresVectorIndexAdapter upsert and search", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let vectorIndex: PostgresVectorIndexAdapter;
  const EMBEDDING_DIM = 1536;

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    vectorIndex = new PostgresVectorIndexAdapter(ctx.db);
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function setupData(
    tenantId: string,
    principalA: string,
    principalB: string,
    uriA: string,
    uriB: string,
  ) {
    const sourceIdA = crypto.randomUUID();
    const sourceIdB = crypto.randomUUID();
    const docIdA = crypto.randomUUID();
    const docIdB = crypto.randomUUID();
    const docVersionIdA = crypto.randomUUID();
    const docVersionIdB = crypto.randomUUID();
    const chunkIdA = crypto.randomUUID();
    const chunkIdB = crypto.randomUUID();
    const indexVersionId = crypto.randomUUID();

    await ctx.db.drizzle.insert(sources).values([
      { id: sourceIdA, tenantId, principalId: principalA, type: "url" as const, uri: uriA },
      { id: sourceIdB, tenantId, principalId: principalB, type: "url" as const, uri: uriB },
    ]);

    await ctx.db.drizzle.insert(documents).values([
      { id: docIdA, tenantId, principalId: principalA, sourceId: sourceIdA, title: "Document A" },
      { id: docIdB, tenantId, principalId: principalB, sourceId: sourceIdB, title: "Document B" },
    ]);

    await ctx.db.drizzle.insert(documentVersions).values([
      {
        id: docVersionIdA,
        documentId: docIdA,
        tenantId,
        principalId: principalA,
        versionNumber: 1,
        contentHash: "ha",
        checksum: "ca",
        sizeBytes: 1,
      },
      {
        id: docVersionIdB,
        documentId: docIdB,
        tenantId,
        principalId: principalB,
        versionNumber: 1,
        contentHash: "hb",
        checksum: "cb",
        sizeBytes: 1,
      },
    ]);

    await ctx.db.drizzle.insert(chunks).values([
      {
        id: chunkIdA,
        documentVersionId: docVersionIdA,
        tenantId,
        principalId: principalA,
        sequenceNumber: 0,
        content: "chunk for principal A only",
        contentHash: "cha",
        locator: { type: "line" as const, path: "/" },
      },
      {
        id: chunkIdB,
        documentVersionId: docVersionIdB,
        tenantId,
        principalId: principalB,
        sequenceNumber: 0,
        content: "chunk for principal B only",
        contentHash: "chb",
        locator: { type: "line" as const, path: "/" },
      },
    ]);

    await ctx.db.drizzle.insert(indexVersions).values({
      id: indexVersionId,
      tenantId,
      indexType: "vector",
      versionNumber: 1,
      embeddingModel: "test",
      embeddingDimension: EMBEDDING_DIM,
      isActive: true,
    });

    const embeddingA = deterministicLocalEmbedding("chunk for principal A only", EMBEDDING_DIM);
    const embeddingB = deterministicLocalEmbedding("chunk for principal B only", EMBEDDING_DIM);

    const chunksForAdapter: Chunk[] = [
      {
        id: chunkIdA,
        documentVersionId: docVersionIdA,
        principalId: principalA,
        sequenceNumber: 0,
        content: "chunk for principal A only",
        contentHash: "cha",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      },
      {
        id: chunkIdB,
        documentVersionId: docVersionIdB,
        principalId: principalB,
        sequenceNumber: 0,
        content: "chunk for principal B only",
        contentHash: "chb",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      },
    ];

    await vectorIndex.upsertEmbeddings(
      chunksForAdapter,
      [embeddingA, embeddingB],
      indexVersionId,
      tenantId,
    );

    return { chunkIdA, chunkIdB, indexVersionId };
  }

  it("can upsert embeddings and search with ACL filter", async () => {
    const tenantId = crypto.randomUUID();
    const principalA = crypto.randomUUID();
    const principalB = crypto.randomUUID();
    const { chunkIdA, chunkIdB, indexVersionId } = await setupData(
      tenantId,
      principalA,
      principalB,
      "https://example.com/a",
      "https://example.com/b",
    );

    const queryEmbedding = deterministicLocalEmbedding("chunk for principal A only", EMBEDDING_DIM);
    const result = await vectorIndex.search(queryEmbedding, tenantId, {
      indexVersionId,
      limit: 10,
      filter: { principalId: [principalA] },
    });

    expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const retrievedChunkIds = result.value.map((r) => r.chunkId);
    expect(retrievedChunkIds).toContain(chunkIdA);
    expect(retrievedChunkIds).not.toContain(chunkIdB);
  });

  it("can search without filter and get all chunks", async () => {
    const tenantId = crypto.randomUUID();
    const principalA = crypto.randomUUID();
    const principalB = crypto.randomUUID();
    const { chunkIdA, chunkIdB, indexVersionId } = await setupData(
      tenantId,
      principalA,
      principalB,
      "https://example.com/c",
      "https://example.com/d",
    );

    const queryEmbedding = deterministicLocalEmbedding("chunk for principal", EMBEDDING_DIM);
    const result = await vectorIndex.search(queryEmbedding, tenantId, {
      indexVersionId,
      limit: 10,
    });

    expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
    if (!result.ok) return;

    const retrievedChunkIds = result.value.map((r) => r.chunkId);
    expect(retrievedChunkIds).toContain(chunkIdA);
    expect(retrievedChunkIds).toContain(chunkIdB);
  });
});
