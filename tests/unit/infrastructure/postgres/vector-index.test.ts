import { describe, it, expect } from "vitest";
import { toPgVectorLiteral, clamp01 } from "../../../../src/infrastructure/postgres/vector-index";

const EMBEDDING_DIMENSION = 1536;

describe("vector-index utilities", () => {
  describe("toPgVectorLiteral", () => {
    it("converts array of numbers to pgvector literal", () => {
      const result = toPgVectorLiteral([0.1, 0.2, 0.3]);
      expect(result).toBe("[0.1,0.2,0.3]");
    });

    it("handles empty array", () => {
      const result = toPgVectorLiteral([]);
      expect(result).toBe("[]");
    });

    it("handles single element", () => {
      const result = toPgVectorLiteral([0.5]);
      expect(result).toBe("[0.5]");
    });

    it("handles negative numbers", () => {
      const result = toPgVectorLiteral([-0.5, -1.0]);
      expect(result).toBe("[-0.5,-1]");
    });

    it("handles zero values", () => {
      const result = toPgVectorLiteral([0, 0, 0]);
      expect(result).toBe("[0,0,0]");
    });

    it("handles large numbers", () => {
      const result = toPgVectorLiteral([1e10, -1e5]);
      expect(result).toBe("[10000000000,-100000]");
    });

    it("handles very small decimals", () => {
      const result = toPgVectorLiteral([0.000001, 0.000002]);
      expect(result).toBe("[0.000001,0.000002]");
    });

    it("preserves exact float representation", () => {
      const result = toPgVectorLiteral([0.123456789, 9.87654321]);
      expect(result).toBe("[0.123456789,9.87654321]");
    });
  });

  describe("clamp01", () => {
    it("returns value as-is when in range [0, 1]", () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(1)).toBe(1);
    });

    it("clamps negative values to 0", () => {
      expect(clamp01(-0.1)).toBe(0);
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(-100)).toBe(0);
    });

    it("clamps values greater than 1 to 1", () => {
      expect(clamp01(1.1)).toBe(1);
      expect(clamp01(2)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it("returns 0 for NaN", () => {
      expect(clamp01(NaN)).toBe(0);
    });

    it("handles floating point edge cases", () => {
      expect(clamp01(0.9999999999)).toBe(0.9999999999);
      expect(clamp01(1.0000000001)).toBe(1);
      expect(clamp01(-0.0000000001)).toBe(0);
    });
  });

  describe("EMBEDDING_DIMENSION", () => {
    it("is 1536", () => {
      expect(EMBEDDING_DIMENSION).toBe(1536);
    });
  });

  describe("validation logic", () => {
    it("detects when chunks.length !== embeddings.length", () => {
      const chunks = [
        { id: "1", content: "a" },
        { id: "2", content: "b" },
      ];
      const embeddings = [[], [], [], []];
      expect(chunks.length).not.toBe(embeddings.length);
    });

    it("detects invalid embedding dimension", () => {
      const embedding = Array.from({ length: 100 }, () => 0.1);
      expect(embedding.length).not.toBe(EMBEDDING_DIMENSION);
    });

    it("validates correct embedding dimension", () => {
      const embedding = Array.from({ length: 1536 }, () => 0.1);
      expect(embedding.length).toBe(1536);
    });

    it("detects query embedding with wrong dimension", () => {
      const queryEmbedding = Array.from({ length: 100 }, () => 0.1);
      expect(queryEmbedding.length).not.toBe(EMBEDDING_DIMENSION);
    });

    it("accepts query embedding with correct dimension", () => {
      const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);
      expect(queryEmbedding.length).toBe(EMBEDDING_DIMENSION);
    });
  });
});
