import { describe, expect, it } from "vitest";
import {
  ReciprocalRankFusion,
  ConvexFusion,
  traceFusion,
  ensureFusionOptions,
} from "../../../../src/infrastructure/postgres/fusion";
import type { RetrievalResult, RetrievalStrategy } from "../../../../src/domain/retrieval/types";

function makeResult(id: string, score: number, chunkId = `chunk-${id}`): RetrievalResult {
  return {
    id,
    strategy: "vector",
    chunkId,
    content: `Content for ${id}`,
    score,
    metadata: {},
  };
}

describe("ReciprocalRankFusion", () => {
  it("fuses results from multiple strategies", () => {
    const fusion = new ReciprocalRankFusion();
    const vectorResults: RetrievalResult[] = [makeResult("v1", 0.9), makeResult("v2", 0.8)];
    const fulltextResults: RetrievalResult[] = [makeResult("f1", 0.85), makeResult("v1", 0.7)];

    const resultsByStrategy = new Map<RetrievalStrategy, RetrievalResult[]>([
      ["vector", vectorResults],
      ["fulltext", fulltextResults],
    ]);

    const result = fusion.fuse(resultsByStrategy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
      expect(result.value[0]!.id).toBe("v1");
    }
  });

  it("respects maxResults option", () => {
    const fusion = new ReciprocalRankFusion();
    const results: RetrievalResult[] = [
      makeResult("r1", 0.9),
      makeResult("r2", 0.8),
      makeResult("r3", 0.7),
      makeResult("r4", 0.6),
    ];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
      { maxResults: 2 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it("deduplicates by chunkId by default", () => {
    const fusion = new ReciprocalRankFusion();
    const vectorResults: RetrievalResult[] = [
      makeResult("v1", 0.9, "same-chunk"),
      makeResult("v2", 0.85, "different-chunk"),
    ];
    const fulltextResults: RetrievalResult[] = [makeResult("f1", 0.8, "same-chunk")];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([
        ["vector", vectorResults],
        ["fulltext", fulltextResults],
      ]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const chunkIds = result.value.map((r) => r.chunkId);
      expect(chunkIds.filter((c) => c === "same-chunk")).toHaveLength(1);
    }
  });

  it("handles empty results", () => {
    const fusion = new ReciprocalRankFusion();
    const result = fusion.fuse(new Map<RetrievalStrategy, RetrievalResult[]>([["vector", []]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("skips zero-weight strategies", () => {
    const fusion = new ReciprocalRankFusion();
    const vectorResults = [makeResult("v1", 0.9)];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", vectorResults]]),
      {
        weights: { vector: 0, fulltext: 0, graph: 0, hybrid: 0 },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("uses custom k value", () => {
    const fusion = new ReciprocalRankFusion(30);
    const results = [makeResult("r1", 0.9)];
    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
    );
    expect(result.ok).toBe(true);
  });

  it("clamps k to minimum of 1", () => {
    const fusion = new ReciprocalRankFusion(0);
    const results = [makeResult("r1", 0.9)];
    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
    );
    expect(result.ok).toBe(true);
  });

  it("sorts by rank position (RRF uses rank, not score)", () => {
    const fusion = new ReciprocalRankFusion();
    const results: RetrievalResult[] = [
      { ...makeResult("first", 0.1) },
      { ...makeResult("second", 0.5) },
      { ...makeResult("third", 0.9) },
    ];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.id).toBe("first");
      expect(result.value[1]!.id).toBe("second");
      expect(result.value[2]!.id).toBe("third");
    }
  });

  it("includes fusion metadata in result", () => {
    const fusion = new ReciprocalRankFusion();
    const results = [makeResult("r1", 0.9)];
    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]!.metadata?.fusionSources).toBeDefined();
      expect(result.value[0]!.metadata?.fusionScore).toBeDefined();
    }
  });
});

describe("ConvexFusion", () => {
  it("fuses results from multiple strategies", () => {
    const fusion = new ConvexFusion();
    const vectorResults: RetrievalResult[] = [makeResult("v1", 0.9), makeResult("v2", 0.8)];
    const fulltextResults: RetrievalResult[] = [makeResult("f1", 0.85)];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([
        ["vector", vectorResults],
        ["fulltext", fulltextResults],
      ]),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });

  it("clamps scores to 0-1 range", () => {
    const fusion = new ConvexFusion();
    const results: RetrievalResult[] = [
      makeResult("r1", 1.5),
      makeResult("r2", -0.5),
      makeResult("r3", 0.5),
    ];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const scores = result.value.map((r) => r.score);
      expect(scores.every((s) => s >= 0 && s <= 1)).toBe(true);
    }
  });

  it("handles empty results", () => {
    const fusion = new ConvexFusion();
    const result = fusion.fuse(new Map<RetrievalStrategy, RetrievalResult[]>([["vector", []]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("respects maxResults option", () => {
    const fusion = new ConvexFusion();
    const results: RetrievalResult[] = [
      makeResult("r1", 0.9),
      makeResult("r2", 0.8),
      makeResult("r3", 0.7),
    ];

    const result = fusion.fuse(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", results]]),
      { maxResults: 2 },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });
});

describe("traceFusion", () => {
  it("traces fusion results", () => {
    const vectorResults: RetrievalResult[] = [makeResult("v1", 0.9), makeResult("v2", 0.8)];
    const fused: RetrievalResult[] = [
      { ...makeResult("v1", 0.9), metadata: { fusionSources: ["vector"] } },
      { ...makeResult("v2", 0.8), metadata: { fusionSources: ["vector"] } },
    ];

    const traces = traceFusion(
      new Map<RetrievalStrategy, RetrievalResult[]>([["vector", vectorResults]]),
      fused,
    );

    expect(traces).toHaveLength(1);
    expect(traces[0]!.strategy).toBe("vector");
    expect(traces[0]!.inputs).toBe(2);
    expect(traces[0]!.fused).toBe(2);
  });

  it("handles empty results", () => {
    const traces = traceFusion(new Map<RetrievalStrategy, RetrievalResult[]>([["vector", []]]), []);
    expect(traces).toHaveLength(1);
    expect(traces[0]!.inputs).toBe(0);
    expect(traces[0]!.fused).toBe(0);
  });
});

describe("ensureFusionOptions", () => {
  it("returns empty options when undefined", () => {
    const result = ensureFusionOptions(undefined);
    expect(result).toEqual({});
  });

  it("returns options when valid", () => {
    const result = ensureFusionOptions({
      weights: { vector: 0.5, fulltext: 0.5 },
    });
    expect(result.weights?.vector).toBe(0.5);
  });

  it("returns failure when all weights are zero", () => {
    const result = ensureFusionOptions({
      weights: { vector: 0, fulltext: 0, graph: 0, hybrid: 0 },
    }) as any;
    expect(result.ok).toBe(false);
  });

  it("returns failure when all weights are negative", () => {
    const result = ensureFusionOptions({
      weights: { vector: -0.1, fulltext: -0.2, graph: 0, hybrid: 0 },
    }) as any;
    expect(result.ok).toBe(false);
  });

  it("returns options when at least one weight is positive", () => {
    const result = ensureFusionOptions({
      weights: { vector: 0.6, fulltext: 0, graph: 0, hybrid: 0 },
    });
    expect(result.weights?.vector).toBe(0.6);
  });
});
