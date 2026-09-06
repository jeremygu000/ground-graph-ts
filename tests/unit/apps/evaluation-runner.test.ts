import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import {
  loadDataset,
  computePercentile,
  computeAverage,
  createGeneratorStub,
  createVectorService,
  createInMemoryVectorPort,
} from "../../../apps/evaluation-runner/src/runner";
import {
  InMemoryEmbeddingAdapter,
  InMemoryVectorIndex,
} from "../../../src/infrastructure/models/in-memory";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

describe("loadDataset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses dataset with cases and metadata", () => {
    const mockDataset = {
      name: "test-dataset",
      version: "1.0.0",
      description: "Test dataset",
      embedding_model: "test-embedding",
      embedding_dimension: 1536,
      reranker_model: "test-reranker",
      generator_model: "test-gen",
      cases: [
        {
          id: "case-1",
          type: "factual",
          tags: ["tag1"],
          question: "What is test?",
          tenantId: "tenant-1",
          principalId: "user-1",
          expectedStatus: "answered",
          expectedAnswer: "test answer",
          requiredClaimText: "test",
          forbiddenClaimText: [],
          expectedEntities: [],
          expectedEvidenceChunkIds: ["chunk-1"],
        },
      ],
    };

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(JSON.stringify(mockDataset));

    const result = loadDataset("test-path.json");

    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]!.id).toBe("case-1");
    expect(result.metadata.name).toBe("test-dataset");
    expect(result.metadata.version).toBe("1.0.0");
    expect(result.metadata.embedding_dimension).toBe(1536);
  });

  it("handles empty cases array", () => {
    const mockDataset = {
      name: "empty-dataset",
      version: "1.0.0",
      description: "Empty",
      embedding_model: "test",
      embedding_dimension: 1536,
      reranker_model: "test",
      generator_model: "test",
      cases: [],
    };

    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValueOnce(JSON.stringify(mockDataset));

    const result = loadDataset("empty.json");
    expect(result.cases).toHaveLength(0);
  });
});

describe("computePercentile", () => {
  it("returns 0 for empty array", () => {
    expect(computePercentile([], 50)).toBe(0);
  });

  it("returns 0th percentile correctly", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 0)).toBe(1);
  });

  it("returns 50th percentile correctly", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("returns 100th percentile correctly", () => {
    expect(computePercentile([1, 2, 3, 4, 5], 100)).toBe(5);
  });

  it("handles unsorted input", () => {
    expect(computePercentile([5, 1, 3, 2, 4], 50)).toBe(3);
  });

  it("handles single element", () => {
    expect(computePercentile([42], 50)).toBe(42);
  });

  it("handles percentile below 0 as 0", () => {
    expect(computePercentile([1, 2, 3], -10)).toBe(1);
  });

  it("handles percentile at boundary", () => {
    const values = [1, 2, 3];
    expect(computePercentile(values, 100)).toBe(3);
  });

  it("handles large arrays", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(computePercentile(values, 95)).toBe(95);
    expect(computePercentile(values, 99)).toBe(99);
  });

  it("handles percentile for 4-element array at 50", () => {
    const values = [1, 2, 3, 4];
    const result = computePercentile(values, 50);
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(4);
  });
});

describe("computeAverage", () => {
  it("returns 0 for empty array", () => {
    expect(computeAverage([])).toBe(0);
  });

  it("computes average of single element", () => {
    expect(computeAverage([42])).toBe(42);
  });

  it("computes average correctly", () => {
    expect(computeAverage([1, 2, 3, 4, 5])).toBe(3);
  });

  it("handles unsorted input", () => {
    expect(computeAverage([5, 1, 3, 2, 4])).toBe(3);
  });

  it("handles large values", () => {
    expect(computeAverage([1000000, 2000000, 3000000])).toBe(2000000);
  });

  it("handles decimal values", () => {
    expect(computeAverage([0.1, 0.2, 0.3])).toBeCloseTo(0.2);
  });

  it("handles negative values", () => {
    expect(computeAverage([-5, -1, 0, 1, 5])).toBe(0);
  });
});

describe("createGeneratorStub", () => {
  it("returns insufficient_evidence when no evidence", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "What is 2+2?",
      evidence: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("insufficient_evidence");
      expect(result.value.structured.answer).toBe("");
      expect(result.value.structured.refusalReason).toBe("offline-deterministic-mode-no-evidence");
    }
  });

  it("returns insufficient_evidence when evidence does not match question", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "What is the color of the sky?",
      evidence: [{ snippet: "Apples are red fruits", citationId: "c1" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("insufficient_evidence");
      expect(result.value.structured.refusalReason).toBe(
        "offline-deterministic-mode-no-matching-evidence",
      );
    }
  });

  it("returns answered when evidence matches question", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "What is the capital of France?",
      evidence: [{ snippet: "Paris is the capital of France", citationId: "c1" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("answered");
      expect(result.value.structured.answer).toContain("Paris");
      expect(result.value.structured.claims).toHaveLength(1);
    }
  });

  it("getModel returns offline-stub", () => {
    const stub = createGeneratorStub();
    expect(stub.getModel()).toBe("offline-stub");
  });

  it("filters stop words when matching evidence", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "What is the test result?",
      evidence: [{ snippet: "The test shows positive results", citationId: "c1" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("answered");
    }
  });

  it("handles multiple evidence items", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "What is the capital of France?",
      evidence: [
        { snippet: "France is a country in Europe", citationId: "c1" },
        { snippet: "Paris is the capital of France", citationId: "c2" },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("answered");
      expect(result.value.structured.claims).toHaveLength(1);
      expect(result.value.structured.claims[0]!.citations).toHaveLength(2);
    }
  });

  it("generates claim with correct citation mapping", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "Who invented Python?",
      evidence: [{ snippet: "Guido van Rossum created Python", citationId: "cite-guido" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.structured.status).toBe("answered");
      const claim = result.value.structured.claims[0]!;
      expect(claim.supportedBy).toContain("cite-guido");
    }
  });

  it("returns zero tokens when no evidence", async () => {
    const stub = createGeneratorStub();
    const result = await stub.generateStructured({
      question: "Any question?",
      evidence: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.promptTokens).toBe(0);
      expect(result.value.completionTokens).toBe(0);
      expect(result.value.totalTokens).toBe(0);
    }
  });
});

describe("createInMemoryVectorPort", () => {
  const corpus = [
    {
      chunkId: "chunk-1",
      documentVersionId: "docver-1",
      documentId: "doc-1",
      content: "Python is a programming language",
      locator: { path: "test.py", startLine: 1, endLine: 1 },
    },
    {
      chunkId: "chunk-2",
      documentVersionId: "docver-1",
      documentId: "doc-1",
      content: "JavaScript is another language",
      locator: { path: "test.js", startLine: 1, endLine: 1 },
    },
  ];

  it("creates a vector port with getActiveIndexVersion", () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1");

    expect(port.getActiveIndexVersion).toBeDefined();
  });

  it("returns null for unauthorized tenant", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1");

    const result = await port.getActiveIndexVersion("unauthorized-tenant");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it("returns index info for authorized tenant", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1");

    const result = await port.getActiveIndexVersion("tenant-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBeNull();
      expect(result.value!.tenantId).toBe("tenant-1");
    }
  });

  it("upsertEmbeddings returns upserted count", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1") as any;

    const embeddings = corpus.map(() => Array.from({ length: 1536 }, () => Math.random()));
    const result = await port.upsertEmbeddings(corpus, embeddings, "ver-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.upserted).toBe(2);
    }
  });

  it("search returns empty for unauthorized tenant", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1");

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);
    const result = await port.search(queryEmbedding, "unauthorized-tenant", { limit: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("search respects limit option", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1") as any;

    const embeddings = corpus.map(() => Array.from({ length: 1536 }, () => Math.random()));
    await port.upsertEmbeddings(corpus, embeddings, "ver-1");

    const queryEmbedding = Array.from({ length: 1536 }, () => 0.1);
    const result = await port.search(queryEmbedding, "tenant-1", { limit: 1 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeLessThanOrEqual(1);
    }
  });

  it("deleteByDocumentVersion removes chunks", async () => {
    const index = new InMemoryVectorIndex();
    const port = createInMemoryVectorPort(index, corpus, "ver-1", "tenant-1") as any;

    const result = await port.deleteByDocumentVersion("docver-1");
    expect(result.ok).toBe(true);
  });
});

describe("createVectorService", () => {
  it("creates a VectorQueryService with given embedding and vector", () => {
    const embedding = new InMemoryEmbeddingAdapter("test-model", 1536);
    const index = new InMemoryVectorIndex();
    const vector = createInMemoryVectorPort(index, [], "ver-1", "tenant-1");

    const service = createVectorService(embedding, vector);

    expect(service).toBeDefined();
    expect(service.query).toBeDefined();
  });
});
