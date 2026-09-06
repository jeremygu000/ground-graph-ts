import type {
  FusionOptions,
  FusionTrace,
  RetrievalFusionPort,
} from "../../application/models/ports";
import type { RetrievalResult, RetrievalStrategy } from "../../domain/retrieval/retrieval.schema";
import { success, failure, type Result } from "../../domain/result";
import { ValidationError } from "../../domain/errors";

const DEFAULT_WEIGHTS: Record<RetrievalStrategy, number> = {
  vector: 0.6,
  fulltext: 0.3,
  graph: 0.0,
  hybrid: 0.1,
};

export class ReciprocalRankFusion implements RetrievalFusionPort {
  private readonly k: number;

  constructor(k = 60) {
    this.k = Math.max(1, k);
  }

  fuse(
    resultsByStrategy: Map<RetrievalStrategy, RetrievalResult[]>,
    options?: FusionOptions,
  ): Result<RetrievalResult[]> {
    const weights = { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) };
    const maxResults = options?.maxResults ?? 30;
    const dedup = options?.dedupByChunkId ?? true;

    const chunkKey = (r: RetrievalResult): string =>
      r.chunkId ?? `${r.entityId ?? ""}:${r.factId ?? ""}:${r.id}`;
    const rrfScores = new Map<
      string,
      { result: RetrievalResult; score: number; sources: Set<RetrievalStrategy> }
    >();

    for (const [strategy, results] of resultsByStrategy.entries()) {
      const weight = weights[strategy] ?? 0;
      if (weight <= 0) continue;
      for (let rank = 0; rank < results.length; rank++) {
        const r = results[rank];
        if (!r) continue;
        const key = dedup ? chunkKey(r) : r.id;
        const rrfContribution = weight * (1 / (this.k + rank + 1));
        const existing = rrfScores.get(key);
        if (existing) {
          existing.score += rrfContribution;
          existing.sources.add(strategy);
        } else {
          rrfScores.set(key, {
            result: r,
            score: rrfContribution,
            sources: new Set([strategy]),
          });
        }
      }
    }

    const merged = Array.from(rrfScores.values());
    merged.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.result.id.localeCompare(b.result.id);
    });
    const top = merged.slice(0, maxResults).map((entry) => ({
      ...entry.result,
      score: clamp01(entry.score * 4),
      metadata: {
        ...(entry.result.metadata ?? {}),
        fusionSources: Array.from(entry.sources),
        fusionScore: entry.score,
      },
    }));
    return success(top);
  }
}

export class ConvexFusion implements RetrievalFusionPort {
  fuse(
    resultsByStrategy: Map<RetrievalStrategy, RetrievalResult[]>,
    options?: FusionOptions,
  ): Result<RetrievalResult[]> {
    const weights = { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) };
    const maxResults = options?.maxResults ?? 30;
    const dedup = options?.dedupByChunkId ?? true;

    const chunkKey = (r: RetrievalResult): string =>
      r.chunkId ?? `${r.entityId ?? ""}:${r.factId ?? ""}:${r.id}`;
    const merged = new Map<
      string,
      { result: RetrievalResult; score: number; sources: Set<RetrievalStrategy> }
    >();

    for (const [strategy, results] of resultsByStrategy.entries()) {
      const weight = weights[strategy] ?? 0;
      if (weight <= 0) continue;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (!r) continue;
        const key = dedup ? chunkKey(r) : r.id;
        const contribution = weight * clamp01(r.score);
        const existing = merged.get(key);
        if (existing) {
          existing.score += contribution;
          existing.sources.add(strategy);
        } else {
          merged.set(key, {
            result: r,
            score: contribution,
            sources: new Set([strategy]),
          });
        }
      }
    }

    const arr = Array.from(merged.values());
    arr.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.result.id.localeCompare(b.result.id);
    });
    const top = arr.slice(0, maxResults).map((entry) => ({
      ...entry.result,
      score: clamp01(entry.score),
      metadata: {
        ...(entry.result.metadata ?? {}),
        fusionSources: Array.from(entry.sources),
        fusionScore: entry.score,
      },
    }));
    return success(top);
  }
}

export function traceFusion(
  resultsByStrategy: Map<RetrievalStrategy, RetrievalResult[]>,
  fused: RetrievalResult[],
  options?: FusionOptions,
): FusionTrace[] {
  const weights = { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) };
  const traces: FusionTrace[] = [];
  for (const [strategy, results] of resultsByStrategy.entries()) {
    const fusedCount = fused.filter((f) => {
      const sources = f.metadata?.["fusionSources"] as RetrievalStrategy[] | undefined;
      return sources?.includes(strategy) ?? false;
    }).length;
    traces.push({
      strategy,
      inputs: results.length,
      fused: fusedCount,
      weight: weights[strategy] ?? 0,
    });
  }
  return traces;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function ensureFusionOptions(options?: FusionOptions): FusionOptions {
  if (!options) return {};
  const sum = Object.values({ ...DEFAULT_WEIGHTS, ...(options.weights ?? {}) }).reduce(
    (acc, v) => acc + v,
    0,
  );
  if (sum <= 0) {
    return failure(
      new ValidationError("Fusion weights must have at least one positive value"),
    ) as unknown as FusionOptions;
  }
  return options;
}
