import { describe, expect, it } from "vitest";
import { CitationBuilder } from "../../../src/infrastructure/retrieval/citation-builder";
import type { RetrievalResult } from "../../../src/domain/retrieval/retrieval.schema";

describe("CitationBuilder", () => {
  const builder = new CitationBuilder();

  describe("buildFromRetrieval", () => {
    it("generates citations from retrieval results", async () => {
      const results: RetrievalResult[] = [
        {
          id: "result-1",
          chunkId: "chunk-abc",
          content: "This is the first chunk content with specific facts.",
          score: 0.95,
          strategy: "vector",
          metadata: {
            documentVersionId: "docver-123",
            locator: { path: "/section/1", startLine: 1, endLine: 5 },
          },
        },
        {
          id: "result-2",
          chunkId: "chunk-def",
          content: "This is the second chunk content with more information.",
          score: 0.87,
          strategy: "vector",
          metadata: {
            documentVersionId: "docver-456",
            locator: { path: "/section/2", startLine: 10, endLine: 15 },
          },
        },
      ];

      const result = await builder.buildFromRetrieval(results, "tenant-1");

      expect(result.ok, result.ok ? "" : String(result.error)).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(2);

      const citation1 = result.value[0];
      expect(citation1).toBeDefined();
      expect(citation1?.chunkId).toBe("chunk-abc");
      expect(citation1?.documentVersionId).toBe("docver-123");
      expect(citation1?.locatorPath).toBe("/section/1");
      expect(citation1?.snippet).toBe("This is the first chunk content with specific facts.");
      expect(citation1?.score).toBe(0.95);
      expect(citation1?.citationId).toBeDefined();
      expect(citation1?.evidenceId).toBeDefined();

      const citation2 = result.value[1];
      expect(citation2).toBeDefined();
      expect(citation2?.chunkId).toBe("chunk-def");
      expect(citation2?.documentVersionId).toBe("docver-456");
    });

    it("handles empty results", async () => {
      const result = await builder.buildFromRetrieval([], "tenant-1");

      expect(result.ok, result.ok ? "" : String(result.error)).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(0);
    });

    it("fails when documentVersionId is missing", async () => {
      const results: RetrievalResult[] = [
        {
          id: "result-1",
          chunkId: "chunk-abc",
          content: "Content without metadata",
          score: 0.9,
          strategy: "vector",
          metadata: {},
        },
      ];

      const result = await builder.buildFromRetrieval(results, "tenant-1");

      expect(result.ok).toBe(false);
    });

    it("skips results without chunkId", async () => {
      const results: RetrievalResult[] = [
        {
          id: "result-1",
          content: "No chunk ID",
          score: 0.9,
          strategy: "vector",
          metadata: { documentVersionId: "docver-123" },
        } as RetrievalResult,
        {
          id: "result-2",
          chunkId: "chunk-valid",
          content: "Has chunk ID",
          score: 0.8,
          strategy: "vector",
          metadata: { documentVersionId: "docver-456" },
        },
      ];

      const result = await builder.buildFromRetrieval(results, "tenant-1");

      expect(result.ok, result.ok ? "" : String(result.error)).toBe(true);
      if (!result.ok) return;

      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.chunkId).toBe("chunk-valid");
    });
  });

  describe("buildEvidenceReferences", () => {
    it("converts citations to evidence references", () => {
      const citations = [
        {
          citationId: "cite-1",
          evidenceId: "evid-1",
          chunkId: "chunk-abc",
          documentVersionId: "docver-123",
          locatorPath: "/intro",
          snippet: "Some content",
          startChar: 0,
          endChar: 12,
          score: 0.95,
        },
      ];

      const evidenceRefs = builder.buildEvidenceReferences(citations);

      expect(evidenceRefs).toHaveLength(1);
      expect(evidenceRefs[0]?.evidenceId).toBe("evid-1");
      expect(evidenceRefs[0]?.chunkId).toBe("chunk-abc");
      expect(evidenceRefs[0]?.position.startChar).toBe(0);
      expect(evidenceRefs[0]?.position.endChar).toBe(12);
      expect(evidenceRefs[0]?.snippet).toBe("Some content");
    });

    it("handles empty citations", () => {
      const evidenceRefs = builder.buildEvidenceReferences([]);
      expect(evidenceRefs).toHaveLength(0);
    });
  });
});
