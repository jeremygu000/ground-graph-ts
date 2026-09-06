import { afterAll, beforeAll, describe, expect, it, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import {
  chunks,
  documents,
  documentVersions,
  indexVersions,
  sources,
  chunkEmbeddings,
} from "../../src/infrastructure/postgres/schema";
import { PostgresVectorIndexAdapter } from "../../src/infrastructure/postgres/vector-index";
import { deterministicLocalEmbedding } from "../../src/infrastructure/models/embedding-adapter";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";
import type { Chunk } from "../../src/domain/documents/documents.schema";

await assertContainerRuntime();

describe("PostgresVectorIndexAdapter", () => {
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

  beforeEach(async () => {
    await ctx.db.client.unsafe(
      "TRUNCATE TABLE chunk_embeddings, chunks, document_versions, documents, sources RESTART IDENTITY CASCADE",
    );
  });

  async function createTestData(
    tenantId: string,
    principalId: string,
    content: string,
    isActive = true,
    createIndex = true,
  ) {
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

    if (createIndex) {
      await ctx.db.drizzle.insert(indexVersions).values({
        id: indexVersionId,
        tenantId,
        indexType: "vector",
        versionNumber: 1,
        embeddingModel: "test-model",
        embeddingDimension: EMBEDDING_DIM,
        isActive,
      });
    }

    return { sourceId, docId, docVersionId, chunkId, indexVersionId };
  }

  describe("getActiveIndexVersion", () => {
    it("returns null when no active index exists", async () => {
      const result = await vectorIndex.getActiveIndexVersion(crypto.randomUUID());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it("returns active index version for tenant", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { indexVersionId } = await createTestData(tenantId, principalId, "test content");

      const result = await vectorIndex.getActiveIndexVersion(tenantId);
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.indexVersionId).toBe(indexVersionId);
        expect(result.value.embeddingModel).toBe("test-model");
        expect(result.value.embeddingDimension).toBe(EMBEDDING_DIM);
        expect(result.value.isActive).toBe(true);
      }
    });

    it("returns most recent version when multiple exist", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      await createTestData(tenantId, principalId, "content v1", false);

      await ctx.db.drizzle.insert(indexVersions).values({
        id: crypto.randomUUID(),
        tenantId,
        indexType: "vector",
        versionNumber: 2,
        embeddingModel: "test-model",
        embeddingDimension: EMBEDDING_DIM,
        isActive: true,
      });

      const result = await vectorIndex.getActiveIndexVersion(tenantId);
      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.versionNumber).toBe(2);
      }
    });
  });

  describe("upsertEmbeddings", () => {
    it("inserts embeddings successfully", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const content = "Test content for embedding";
      const { chunkId, indexVersionId } = await createTestData(tenantId, principalId, content);

      const chunk: Chunk = {
        id: chunkId,
        documentVersionId: "",
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const embedding = deterministicLocalEmbedding(content, EMBEDDING_DIM);

      const result = await vectorIndex.upsertEmbeddings(
        [chunk],
        [embedding],
        indexVersionId,
        tenantId,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.upserted).toBe(1);
        expect(result.value.indexVersionId).toBe(indexVersionId);
      }

      const stored = await ctx.db.drizzle
        .select()
        .from(chunkEmbeddings)
        .where(eq(chunkEmbeddings.chunkId, chunkId));
      expect(stored).toHaveLength(1);
    });

    it("updates existing embeddings on conflict", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const content = "Original content";
      const { chunkId, indexVersionId } = await createTestData(tenantId, principalId, content);

      const chunk: Chunk = {
        id: chunkId,
        documentVersionId: "",
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const embedding1 = deterministicLocalEmbedding(content, EMBEDDING_DIM);
      const embedding2 = deterministicLocalEmbedding("Updated content", EMBEDDING_DIM);

      await vectorIndex.upsertEmbeddings([chunk], [embedding1], indexVersionId, tenantId);
      const result = await vectorIndex.upsertEmbeddings(
        [chunk],
        [embedding2],
        indexVersionId,
        tenantId,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.upserted).toBe(1);
      }

      const stored = await ctx.db.drizzle
        .select()
        .from(chunkEmbeddings)
        .where(eq(chunkEmbeddings.chunkId, chunkId));
      expect(stored).toHaveLength(1);
    });

    it("fails when chunks and embeddings count mismatch", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const content = "Test content";
      const { indexVersionId } = await createTestData(tenantId, principalId, content);

      const chunk: Chunk = {
        id: crypto.randomUUID(),
        documentVersionId: "",
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const embedding = deterministicLocalEmbedding(content, EMBEDDING_DIM);

      const result = await vectorIndex.upsertEmbeddings(
        [chunk],
        [embedding, embedding],
        indexVersionId,
        tenantId,
      );
      expect(result.ok).toBe(false);
    });

    it("fails when embedding has wrong dimension", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const content = "Test content";
      const { indexVersionId } = await createTestData(tenantId, principalId, content);

      const chunk: Chunk = {
        id: crypto.randomUUID(),
        documentVersionId: "",
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const wrongEmbedding = [0.1, 0.2, 0.3];

      const result = await vectorIndex.upsertEmbeddings(
        [chunk],
        [wrongEmbedding],
        indexVersionId,
        tenantId,
      );
      expect(result.ok).toBe(false);
    });
  });

  describe("search", () => {
    it("returns empty results for unauthorized tenant", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { indexVersionId } = await createTestData(tenantId, principalId, "test content");

      const queryEmbedding = deterministicLocalEmbedding("test", EMBEDDING_DIM);
      const result = await vectorIndex.search(queryEmbedding, crypto.randomUUID(), {
        indexVersionId,
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });

    it("finds matching content by vector similarity", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { chunkId, indexVersionId } = await createTestData(
        tenantId,
        principalId,
        "The capital of France is Paris",
      );

      const chunk: Chunk = {
        id: chunkId,
        documentVersionId: "",
        principalId,
        sequenceNumber: 0,
        content: "The capital of France is Paris",
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const embedding = deterministicLocalEmbedding(
        "The capital of France is Paris",
        EMBEDDING_DIM,
      );
      await vectorIndex.upsertEmbeddings([chunk], [embedding], indexVersionId, tenantId);

      const queryEmbedding = deterministicLocalEmbedding("France capital city", EMBEDDING_DIM);
      const result = await vectorIndex.search(queryEmbedding, tenantId, {
        indexVersionId,
        limit: 10,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeGreaterThan(0);
        expect(result.value[0]?.content).toContain("France");
      }
    });

    it("respects limit option", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { indexVersionId: iv1 } = await createTestData(tenantId, principalId, "content one");
      const { chunkId: chunkId2 } = await createTestData(
        tenantId,
        principalId,
        "content two",
        true,
        false,
      );

      for (const { chunkId, content } of [
        { chunkId: crypto.randomUUID(), content: "content one" },
        { chunkId: chunkId2, content: "content two" },
      ]) {
        const chunk: Chunk = {
          id: chunkId,
          documentVersionId: "",
          principalId,
          sequenceNumber: 0,
          content,
          contentHash: "chash",
          locator: { type: "line", path: "/" },
          createdAt: new Date().toISOString(),
        };
        const embedding = deterministicLocalEmbedding(content, EMBEDDING_DIM);
        await vectorIndex.upsertEmbeddings([chunk], [embedding], iv1, tenantId);
      }

      const queryEmbedding = deterministicLocalEmbedding("content", EMBEDDING_DIM);
      const result = await vectorIndex.search(queryEmbedding, tenantId, {
        indexVersionId: iv1,
        limit: 1,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBeLessThanOrEqual(1);
      }
    });

    it("fails when query embedding has wrong dimension", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const { indexVersionId } = await createTestData(tenantId, principalId, "test content");

      const wrongEmbedding = [0.1, 0.2, 0.3];
      const result = await vectorIndex.search(wrongEmbedding, tenantId, {
        indexVersionId,
        limit: 10,
      });

      expect(result.ok).toBe(false);
    });

    it("fails when indexVersionId is not provided", async () => {
      const tenantId = crypto.randomUUID();
      const queryEmbedding = deterministicLocalEmbedding("test", EMBEDDING_DIM);

      const result = await vectorIndex.search(queryEmbedding, tenantId, {
        limit: 10,
      } as any);

      expect(result.ok).toBe(false);
    });
  });

  describe("deleteByDocumentVersion", () => {
    it("deletes embeddings for document version", async () => {
      const tenantId = crypto.randomUUID();
      const principalId = crypto.randomUUID();
      const content = "Content to delete";
      const { chunkId, docVersionId, indexVersionId } = await createTestData(
        tenantId,
        principalId,
        content,
      );

      const chunk: Chunk = {
        id: chunkId,
        documentVersionId: docVersionId,
        principalId,
        sequenceNumber: 0,
        content,
        contentHash: "chash",
        locator: { type: "line", path: "/" },
        createdAt: new Date().toISOString(),
      };
      const embedding = deterministicLocalEmbedding(content, EMBEDDING_DIM);
      await vectorIndex.upsertEmbeddings([chunk], [embedding], indexVersionId, tenantId);

      const result = await vectorIndex.deleteByDocumentVersion(docVersionId, tenantId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBeGreaterThanOrEqual(1);
      }

      const stored = await ctx.db.drizzle
        .select()
        .from(chunkEmbeddings)
        .where(eq(chunkEmbeddings.chunkId, chunkId));
      expect(stored).toHaveLength(0);
    });

    it("returns deleted 0 when document version has no chunks", async () => {
      const tenantId = crypto.randomUUID();
      const result = await vectorIndex.deleteByDocumentVersion(crypto.randomUUID(), tenantId);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.deleted).toBe(0);
      }
    });
  });
});
