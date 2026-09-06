import { describe, it, expect } from "vitest";
import {
  buildTsQuery,
  sanitize,
  clamp01,
  clamp,
} from "../../../../src/infrastructure/postgres/fulltext-index";
import {
  tokenize,
  lexicalOverlapScore,
} from "../../../../src/infrastructure/models/rerank-adapter";

describe("fulltext-index utilities", () => {
  describe("sanitize", () => {
    it("removes non-alphanumeric characters", () => {
      expect(sanitize("hello!")).toBe("hello");
      expect(sanitize("test@example")).toBe("testexample");
    });

    it("converts to lowercase", () => {
      expect(sanitize("HELLO")).toBe("hello");
      expect(sanitize("TeSt")).toBe("test");
    });

    it("handles mixed case and special chars", () => {
      expect(sanitize("Hello, World!")).toBe("helloworld");
    });

    it("handles empty string", () => {
      expect(sanitize("")).toBe("");
    });

    it("handles only special chars", () => {
      expect(sanitize("!@#$%")).toBe("");
    });

    it("handles unicode by removing it", () => {
      expect(sanitize("café")).toBe("caf");
      expect(sanitize("naïve")).toBe("nave");
    });

    it("preserves numbers", () => {
      expect(sanitize("test123")).toBe("test123");
    });
  });

  describe("buildTsQuery", () => {
    it("builds simple query", () => {
      const result = buildTsQuery("hello world", "english");
      expect(result).toBe("hello & world");
    });

    it("returns empty string for single character tokens", () => {
      const result = buildTsQuery("a b c", "english");
      expect(result).toBe("");
    });

    it("returns empty string for empty query", () => {
      const result = buildTsQuery("", "english");
      expect(result).toBe("");
    });

    it("filters out tokens shorter than 2 chars after sanitization", () => {
      const result = buildTsQuery("I a testing thx", "english");
      expect(result).toBe("testing & thx");
    });

    it("sanitizes tokens", () => {
      const result = buildTsQuery("hello! world?", "english");
      expect(result).toBe("hello & world");
    });

    it("handles multiple spaces", () => {
      const result = buildTsQuery("hello    world", "english");
      expect(result).toBe("hello & world");
    });

    it("keeps duplicate tokens (no deduplication)", () => {
      const result = buildTsQuery("hello hello hello", "english");
      expect(result).toBe("hello & hello & hello");
    });
  });

  describe("clamp01", () => {
    it("returns value as-is when in range", () => {
      expect(clamp01(0)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(1)).toBe(1);
    });

    it("clamps negative to 0", () => {
      expect(clamp01(-0.1)).toBe(0);
      expect(clamp01(-1)).toBe(0);
    });

    it("clamps above 1 to 1", () => {
      expect(clamp01(1.1)).toBe(1);
      expect(clamp01(100)).toBe(1);
    });

    it("returns 0 for NaN", () => {
      expect(clamp01(NaN)).toBe(0);
    });
  });

  describe("clamp", () => {
    it("returns value when in range", () => {
      expect(clamp(5, 1, 10)).toBe(5);
      expect(clamp(1, 1, 10)).toBe(1);
      expect(clamp(10, 1, 10)).toBe(10);
    });

    it("clamps below min", () => {
      expect(clamp(0, 1, 10)).toBe(1);
      expect(clamp(-5, 1, 10)).toBe(1);
    });

    it("clamps above max", () => {
      expect(clamp(15, 1, 10)).toBe(10);
      expect(clamp(100, 1, 10)).toBe(10);
    });
  });
});

describe("rerank-adapter tokenize", () => {
  it("tokenizes simple text", () => {
    const result = tokenize("Hello World");
    expect(result).toEqual(["hello", "world"]);
  });

  it("splits on whitespace", () => {
    const result = tokenize("hello  world");
    expect(result).toEqual(["hello", "world"]);
  });

  it("filters empty strings", () => {
    const result = tokenize("hello   world");
    expect(result).toEqual(["hello", "world"]);
  });

  it("handles empty string", () => {
    const result = tokenize("");
    expect(result).toEqual([]);
  });

  it("handles unicode", () => {
    const result = tokenize("café naïve");
    expect(result).toEqual(["café", "naïve"]);
  });

  it("handles numbers", () => {
    const result = tokenize("test123 abc");
    expect(result).toEqual(["test123", "abc"]);
  });
});

describe("rerank-adapter lexicalOverlapScore", () => {
  it("returns 0 for empty query tokens", () => {
    expect(lexicalOverlapScore([], "hello world")).toBe(0);
  });

  it("returns 0 for empty content", () => {
    expect(lexicalOverlapScore(["hello"], "")).toBe(0);
  });

  it("calculates overlap correctly", () => {
    const score = lexicalOverlapScore(["hello", "world"], "hello world");
    expect(score).toBe(1);
  });

  it("calculates partial overlap", () => {
    const score = lexicalOverlapScore(["hello", "world"], "hello");
    expect(score).toBe(0.5);
  });

  it("returns 0 when no overlap", () => {
    const score = lexicalOverlapScore(["foo", "bar"], "hello world");
    expect(score).toBe(0);
  });

  it("handles duplicate query tokens", () => {
    const score = lexicalOverlapScore(["hello", "hello"], "hello world");
    expect(score).toBe(1);
  });
});
