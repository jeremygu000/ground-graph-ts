import { describe, expect, it } from "vitest";
import {
  InMemoryEmbeddingAdapter,
  InMemoryVectorIndex,
  cosineSimilarity,
} from "../../../../src/infrastructure/models/in-memory";

describe("InMemoryEmbeddingAdapter", () => {
  it("returns error for empty input string", async () => {
    const adapter = new InMemoryEmbeddingAdapter("test-model", 4);
    const result = await adapter.embedBatch({ inputs: ["valid", ""], tenantId: "t1" });

    expect(result.ok).toBe(false);
  });

  it("returns error for non-string input", async () => {
    const adapter = new InMemoryEmbeddingAdapter("test-model", 4);
    const result = await adapter.embedBatch({ inputs: [123 as any, "valid"], tenantId: "t1" });

    expect(result.ok).toBe(false);
  });

  it("returns embeddings with correct dimension", async () => {
    const adapter = new InMemoryEmbeddingAdapter("test-model", 4);
    const result = await adapter.embedBatch({ inputs: ["hello"], tenantId: "t1" });

    expect(result.ok).toBe(true);
    if (result.ok && result.value.embeddings[0]) {
      expect(result.value.embeddings[0].embedding).toHaveLength(4);
    }
  });

  it("getDimension returns configured dimension", () => {
    const adapter = new InMemoryEmbeddingAdapter("test-model", 1536);
    expect(adapter.getDimension()).toBe(1536);
  });

  it("getModel returns configured model", () => {
    const adapter = new InMemoryEmbeddingAdapter("text-embedding-3-small", 4);
    expect(adapter.getModel()).toBe("text-embedding-3-small");
  });
});

describe("InMemoryVectorIndex", () => {
  it("deleteByDocumentVersion removes entries", () => {
    const index = new InMemoryVectorIndex();
    index.upsert([
      {
        chunkId: "c1",
        documentVersionId: "dv1",
        documentId: "d1",
        content: "hello",
        locator: {},
        metadata: {},
        embedding: [0.1, 0.2, 0.3, 0.4],
        indexVersionId: "v1",
        embeddingModel: "test",
        dimension: 4,
      },
    ]);

    const deleted = index.deleteByDocumentVersion("dv1");
    expect(deleted).toBe(1);
  });

  it("deleteByDocumentVersion returns 0 when nothing to delete", () => {
    const index = new InMemoryVectorIndex();
    const deleted = index.deleteByDocumentVersion("nonexistent");
    expect(deleted).toBe(0);
  });

  it("registerVersion stores version info", () => {
    const index = new InMemoryVectorIndex();
    index.registerVersion("tenant-1", "v1", { versionNumber: 1, model: "test", dimension: 4 });
    index.setActiveIndex("tenant-1", "v1");

    const results = index.search("tenant-1", [0.1, 0.2, 0.3, 0.4], {});
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const sim = cosineSimilarity([1, 0, 0], [1, 0, 0]);
    expect(sim).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    const sim = cosineSimilarity([1, 0, 0], [0, 1, 0]);
    expect(sim).toBeCloseTo(0);
  });

  it("returns 0 for different length vectors", () => {
    const sim = cosineSimilarity([1, 0], [1, 0, 0]);
    expect(sim).toBe(0);
  });

  it("returns 0 for zero vectors", () => {
    const sim = cosineSimilarity([0, 0, 0], [1, 0, 0]);
    expect(sim).toBe(0);
  });
});
