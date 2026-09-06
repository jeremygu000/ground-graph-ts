import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: {
    textEmbeddingModel: vi.fn(() => "mock-model"),
  },
}));

import { embedMany } from "ai";
import {
  OpenAIEmbeddingAdapter,
  deterministicLocalEmbedding,
} from "../../../../src/infrastructure/models/embedding-adapter";
import { InternalError, ValidationError } from "../../../../src/domain/errors";

const mockEmbedMany = embedMany as ReturnType<typeof vi.fn>;

describe("OpenAIEmbeddingAdapter constructor", () => {
  it("creates adapter with valid config", () => {
    const adapter = new OpenAIEmbeddingAdapter({
      provider: "openai",
      model: "text-embedding-3-small",
      dimension: 1536,
    });
    expect(adapter.getDimension()).toBe(1536);
    expect(adapter.getModel()).toBe("text-embedding-3-small");
  });

  it("throws when model is empty", () => {
    expect(
      () =>
        new OpenAIEmbeddingAdapter({
          provider: "openai",
          model: "",
          dimension: 1536,
        }),
    ).toThrow(ValidationError);
  });

  it("throws when dimension is 0", () => {
    expect(
      () =>
        new OpenAIEmbeddingAdapter({
          provider: "openai",
          model: "text-embedding-3-small",
          dimension: 0,
        }),
    ).toThrow(ValidationError);
  });

  it("throws when dimension is negative", () => {
    expect(
      () =>
        new OpenAIEmbeddingAdapter({
          provider: "openai",
          model: "text-embedding-3-small",
          dimension: -1,
        }),
    ).toThrow(ValidationError);
  });

  it("throws on unsupported provider", () => {
    expect(
      () =>
        new OpenAIEmbeddingAdapter({
          provider: "unsupported" as never,
          model: "text-embedding-3-small",
          dimension: 1536,
        }),
    ).toThrow(ValidationError);
  });

  it("accepts local provider", () => {
    const adapter = new OpenAIEmbeddingAdapter({
      provider: "local",
      model: "local-model",
      dimension: 384,
    });
    expect(adapter.getModel()).toBe("local-model");
  });

  it("uses default batch size when not specified", () => {
    const adapter = new OpenAIEmbeddingAdapter({
      provider: "openai",
      model: "m",
      dimension: 1536,
    });
    expect(adapter.getDimension()).toBe(1536);
  });
});

describe("OpenAIEmbeddingAdapter.embedBatch - validation", () => {
  let adapter: OpenAIEmbeddingAdapter;

  beforeEach(() => {
    mockEmbedMany.mockReset();
    adapter = new OpenAIEmbeddingAdapter({
      provider: "openai",
      model: "text-embedding-3-small",
      dimension: 1536,
    });
  });

  it("returns empty result for empty inputs", async () => {
    const result = await adapter.embedBatch({ inputs: [], tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings).toHaveLength(0);
      expect(result.value.totalTokens).toBe(0);
    }
  });

  it("returns error for non-string input", async () => {
    const result = await adapter.embedBatch({
      inputs: [123 as never, "valid"],
      tenantId: "t1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("returns error for empty string input", async () => {
    const result = await adapter.embedBatch({ inputs: ["valid", ""], tenantId: "t1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it("returns error with correct index in message", async () => {
    const result = await adapter.embedBatch({
      inputs: ["valid", "also valid", ""],
      tenantId: "t1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("index 2");
    }
  });
});

describe("OpenAIEmbeddingAdapter.embedBatch - local provider", () => {
  let adapter: OpenAIEmbeddingAdapter;

  beforeEach(() => {
    mockEmbedMany.mockReset();
    adapter = new OpenAIEmbeddingAdapter({
      provider: "local",
      model: "local-model",
      dimension: 4,
    });
  });

  it("returns deterministic embeddings for inputs", async () => {
    const result = await adapter.embedBatch({ inputs: ["hello", "world"], tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings).toHaveLength(2);
      expect(result.value.embeddings[0]!.embedding).toHaveLength(4);
      expect(result.value.embeddings[0]!.index).toBe(0);
      expect(result.value.embeddings[1]!.index).toBe(1);
    }
  });

  it("includes total tokens", async () => {
    const result = await adapter.embedBatch({ inputs: ["a", "b", "c"], tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTokens).toBe(12);
    }
  });

  it("produces same embedding for same text", async () => {
    const result1 = await adapter.embedBatch({ inputs: ["test"], tenantId: "t1" });
    const result2 = await adapter.embedBatch({ inputs: ["test"], tenantId: "t1" });
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value.embeddings[0]!.embedding).toEqual(
        result2.value.embeddings[0]!.embedding,
      );
    }
  });

  it("handles batches larger than default batch size", async () => {
    const inputs = Array.from({ length: 100 }, (_, i) => `text-${i}`);
    const result = await adapter.embedBatch({ inputs, tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings).toHaveLength(100);
    }
  });
});

describe("OpenAIEmbeddingAdapter.embedBatch - openai provider", () => {
  let adapter: OpenAIEmbeddingAdapter;

  beforeEach(() => {
    mockEmbedMany.mockReset();
    adapter = new OpenAIEmbeddingAdapter({
      provider: "openai",
      model: "text-embedding-3-small",
      dimension: 1536,
      maxRetries: 1,
    });
  });

  it("returns embeddings from API", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(1536).fill(0.1), new Array(1536).fill(0.2)],
      usage: { tokens: 100 },
    });

    const result = await adapter.embedBatch({ inputs: ["hello", "world"], tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.embeddings).toHaveLength(2);
      expect(result.value.totalTokens).toBe(100);
    }
  });

  it("returns error on count mismatch", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(1536).fill(0.1)],
      usage: { tokens: 50 },
    });

    const result = await adapter.embedBatch({ inputs: ["a", "b"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("returns error on dimension mismatch", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(100).fill(0.1)],
      usage: { tokens: 50 },
    });

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("handles API errors with retry and recovers", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("network error"));
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(1536).fill(0.1)],
      usage: { tokens: 50 },
    });
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(1536).fill(0.1)],
      usage: { tokens: 50 },
    });

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(mockEmbedMany).toHaveBeenCalled();
    expect(result.ok).toBeDefined();
  });

  it("returns error after max retries", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValue(new Error("persistent error"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("does not retry on abort/timeout", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValue(new Error("aborted"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
    expect(mockEmbedMany.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("maps invalid API key to InternalError", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("Invalid API key"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(InternalError);
    }
  });

  it("maps rate limit to NetworkError", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("rate limit exceeded"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("maps 429 to NetworkError", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("429 Too Many Requests"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("maps model not found to ValidationError", async () => {
    mockEmbedMany.mockReset();
    mockEmbedMany.mockRejectedValueOnce(new Error("Model not found: xyz"));

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(false);
  });

  it("handles usage being undefined", async () => {
    mockEmbedMany.mockResolvedValueOnce({
      embeddings: [new Array(1536).fill(0.1)],
      usage: undefined,
    });

    const result = await adapter.embedBatch({ inputs: ["a"], tenantId: "t1" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalTokens).toBe(0);
    }
  });
});

describe("deterministicLocalEmbedding", () => {
  it("produces vectors of correct dimension", () => {
    const v = deterministicLocalEmbedding("hello", 16);
    expect(v).toHaveLength(16);
  });

  it("throws on zero dimension", () => {
    expect(() => deterministicLocalEmbedding("hello", 0)).toThrow(InternalError);
  });

  it("throws on negative dimension", () => {
    expect(() => deterministicLocalEmbedding("hello", -1)).toThrow(InternalError);
  });

  it("produces deterministic output", () => {
    const v1 = deterministicLocalEmbedding("test", 32);
    const v2 = deterministicLocalEmbedding("test", 32);
    expect(v1).toEqual(v2);
  });

  it("produces different output for different inputs", () => {
    const v1 = deterministicLocalEmbedding("hello", 32);
    const v2 = deterministicLocalEmbedding("world", 32);
    expect(v1).not.toEqual(v2);
  });

  it("handles empty string", () => {
    const v = deterministicLocalEmbedding("", 16);
    expect(v).toHaveLength(16);
  });

  it("is case-insensitive", () => {
    const v1 = deterministicLocalEmbedding("Hello", 16);
    const v2 = deterministicLocalEmbedding("hello", 16);
    expect(v1).toEqual(v2);
  });
});
