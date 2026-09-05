import type { RerankPort, RerankRequest, RerankerConfig } from "../../application/models/ports";
import type { RetrievalResult } from "../../domain/retrieval/types";
import type { Result } from "../../domain/result";
import { success, failure } from "../../domain/result";
import { InternalError, ValidationError } from "../../domain/errors";
import { withSpan } from "../telemetry";

export class LexicalRerankAdapter implements RerankPort {
  private readonly config: RerankerConfig;

  constructor(config: RerankerConfig) {
    this.config = { ...config };
  }

  getModel(): string {
    return this.config.model;
  }

  async rerank(request: RerankRequest): Promise<Result<RetrievalResult[]>> {
    if (!request.query || request.query.trim().length === 0) {
      return failure(new ValidationError("Rerank query cannot be empty"));
    }
    return withSpan(
      "rerank.lexical",
      async () => {
        const tokens = tokenize(request.query);
        if (tokens.length === 0) {
          return success(request.candidates.slice(0, request.topK ?? this.config.topK ?? 20));
        }
        const scored = request.candidates.map((candidate) => ({
          candidate,
          lexicalScore: lexicalOverlapScore(tokens, candidate.content),
        }));
        const blended = scored.map((s) => ({
          candidate: s.candidate,
          score: blend(s.candidate.score, s.lexicalScore),
        }));
        blended.sort((a, b) => b.score - a.score);
        const topK = request.topK ?? this.config.topK ?? blended.length;
        const top = blended.slice(0, topK).map((b) => ({
          ...b.candidate,
          score: clamp01(b.score),
        }));
        return success(top);
      },
      {
        attributes: {
          "rerank.model": this.config.model,
          "rerank.candidates": String(request.candidates.length),
        },
      },
    );
  }
}

export class NoopRerankAdapter implements RerankPort {
  constructor(private readonly model: string) {}

  getModel(): string {
    return this.model;
  }

  async rerank(request: RerankRequest): Promise<Result<RetrievalResult[]>> {
    const topK = request.topK ?? request.candidates.length;
    return success(request.candidates.slice(0, topK));
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function lexicalOverlapScore(queryTokens: string[], content: string): number {
  if (queryTokens.length === 0) return 0;
  const contentTokens = new Set(tokenize(content));
  if (contentTokens.size === 0) return 0;
  let hits = 0;
  for (const token of queryTokens) {
    if (contentTokens.has(token)) hits++;
  }
  return hits / queryTokens.length;
}

function blend(vectorScore: number, lexicalScore: number): number {
  if (vectorScore < 0 || vectorScore > 1) {
    throw new InternalError("Vector score must be in [0,1]", { vectorScore });
  }
  return clamp01(0.7 * vectorScore + 0.3 * lexicalScore);
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
