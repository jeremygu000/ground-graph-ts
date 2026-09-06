import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  chunks,
  documents,
  documentVersions,
  indexVersions,
  sources,
} from "../../src/infrastructure/postgres/schema";
import { PostgresVectorIndexAdapter } from "../../src/infrastructure/postgres/vector-index";
import { CitationBuilder } from "../../src/infrastructure/retrieval/citation-builder";
import { deterministicLocalEmbedding } from "../../src/infrastructure/models/embedding-adapter";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";
import type { Chunk } from "../../src/domain/documents/types";

await assertContainerRuntime();

describe("Citation E2E with Vector Index", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let vectorIndex: PostgresVectorIndexAdapter;
  let citationBuilder: CitationBuilder;
  const EMBEDDING_DIM = 1536;

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    vectorIndex = new PostgresVectorIndexAdapter(ctx.db);
    citationBuilder = new CitationBuilder();
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  async function setupData(tenantId: string, principalId: string, content: string, uri: string) {
    const sourceId = crypto.randomUUID();
    const docId = crypto.randomUUID();
    const docVersionId = crypto.randomUUID();
    const chunkId = crypto.randomUUID();
    const indexVersionId = crypto.randomUUID();

    await ctx.db.drizzle.insert(sources).values({
      id: sourceId,
      tenantId,
      principalId,
      type: "url" as const,
      uri,
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

    await ctx.db.drizzle.insert(indexVersions).values({
      id: indexVersionId,
      tenantId,
      indexType: "vector",
      versionNumber: 1,
      embeddingModel: "test",
      embeddingDimension: EMBEDDING_DIM,
      isActive: true,
    });

    const embedding = deterministicLocalEmbedding(content, EMBEDDING_DIM);

    const chunksForAdapter: Chunk[] = [
      {
        id: chunkId,
        documentVersionId: docVersionId,
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      },
    ];

    await vectorIndex.upsertEmbeddings(chunksForAdapter, [embedding], indexVersionId, tenantId);

    return { chunkId, docVersionId, indexVersionId };
  }

  it("generates citations from search results", async () => {
    const tenantId = crypto.randomUUID();
    const principalId = crypto.randomUUID();
    const content = "The capital of France is Paris.";
    const { chunkId, indexVersionId } = await setupData(
      tenantId,
      principalId,
      content,
      "https://example.com/france",
    );

    const queryEmbedding = deterministicLocalEmbedding("France capital", EMBEDDING_DIM);
    const searchResult = await vectorIndex.search(queryEmbedding, tenantId, {
      indexVersionId,
      limit: 10,
      filter: { principalId: [principalId] },
    });

    expect(searchResult.ok, searchResult.ok ? "" : JSON.stringify(searchResult)).toBe(true);
    if (!searchResult.ok) return;

    const citationsResult = await citationBuilder.buildFromRetrieval(
      searchResult.value.map((r) => ({
        id: r.chunkId,
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        strategy: "vector" as const,
        metadata: {
          documentVersionId: r.documentVersionId,
          locator: r.locator,
        },
      })),
      tenantId,
    );

    expect(citationsResult.ok, citationsResult.ok ? "" : JSON.stringify(citationsResult)).toBe(
      true,
    );
    if (!citationsResult.ok) return;

    expect(citationsResult.value).toHaveLength(1);
    expect(citationsResult.value[0]?.chunkId).toBe(chunkId);
    expect(citationsResult.value[0]?.snippet).toBe(content);
    expect(citationsResult.value[0]?.evidenceId).toBeDefined();
    expect(citationsResult.value[0]?.citationId).toBeDefined();
  });

  it("builds evidence references from citations", async () => {
    const tenantId = crypto.randomUUID();
    const principalId = crypto.randomUUID();
    const content = "Water boils at 100 degrees Celsius.";
    const { chunkId, indexVersionId } = await setupData(
      tenantId,
      principalId,
      content,
      "https://example.com/water",
    );

    const queryEmbedding = deterministicLocalEmbedding("water boiling point", EMBEDDING_DIM);
    const searchResult = await vectorIndex.search(queryEmbedding, tenantId, {
      indexVersionId,
      limit: 10,
    });

    expect(searchResult.ok, searchResult.ok ? "" : JSON.stringify(searchResult)).toBe(true);
    if (!searchResult.ok) return;

    const citationsResult = await citationBuilder.buildFromRetrieval(
      searchResult.value.map((r) => ({
        id: r.chunkId,
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        strategy: "vector" as const,
        metadata: {
          documentVersionId: r.documentVersionId,
          locator: r.locator,
        },
      })),
      tenantId,
    );

    expect(citationsResult.ok, citationsResult.ok ? "" : JSON.stringify(citationsResult)).toBe(
      true,
    );
    if (!citationsResult.ok) return;

    const evidenceRefs = citationBuilder.buildEvidenceReferences(citationsResult.value);

    expect(evidenceRefs).toHaveLength(1);
    expect(evidenceRefs[0]?.chunkId).toBe(chunkId);
    expect(evidenceRefs[0]?.evidenceId).toBe(citationsResult.value[0]?.evidenceId);
    expect(evidenceRefs[0]?.position.startChar).toBe(0);
    expect(evidenceRefs[0]?.position.endChar).toBe(content.length);
    expect(evidenceRefs[0]?.snippet).toBe(content);
  });
});
