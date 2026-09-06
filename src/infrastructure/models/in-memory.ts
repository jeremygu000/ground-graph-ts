import { deterministicLocalEmbedding } from "./embedding-adapter";
import type {
  EmbeddingPort,
  EmbedBatchRequest,
  EmbedBatchResult,
  EmbeddingResult,
} from "../../application/models/ports";
import type { Result } from "../../domain/result";
import { success, failure } from "../../domain/result";
import { ValidationError } from "../../domain/errors";

export interface InMemoryVectorIndexEntry {
  tenantId?: string;
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  embedding: number[];
  indexVersionId: string;
  embeddingModel: string;
  dimension: number;
}

export class InMemoryEmbeddingAdapter implements EmbeddingPort {
  private readonly model: string;
  private readonly dimension: number;

  constructor(model: string, dimension: number) {
    this.model = model;
    this.dimension = dimension;
  }

  getDimension(): number {
    return this.dimension;
  }

  getModel(): string {
    return this.model;
  }

  async embedBatch(request: EmbedBatchRequest): Promise<Result<EmbedBatchResult>> {
    const results: EmbeddingResult[] = [];
    let totalTokens = 0;
    for (let i = 0; i < request.inputs.length; i++) {
      const input = request.inputs[i];
      if (typeof input !== "string" || input.length === 0) {
        return failure(new ValidationError(`Input at index ${i} must be a non-empty string`));
      }
      const embedding = deterministicLocalEmbedding(input, this.dimension);
      results.push({
        embedding,
        index: i,
        tokens: Math.ceil(input.length / 4),
        model: this.model,
        dimension: embedding.length,
      });
      totalTokens += Math.ceil(input.length / 4);
    }
    return success({
      embeddings: results,
      totalTokens,
      model: this.model,
      dimension: this.dimension,
    });
  }
}

export class InMemoryVectorIndex {
  private readonly entries = new Map<string, InMemoryVectorIndexEntry[]>();
  private readonly activeIndexByTenant = new Map<string, string>();
  private readonly versionsByTenant = new Map<
    string,
    Map<string, { versionNumber: number; model: string; dimension: number }>
  >();

  upsert(entries: InMemoryVectorIndexEntry[]): void {
    for (const entry of entries) {
      const list = this.entries.get(entry.chunkId) ?? [];
      const filtered = list.filter((e) => e.indexVersionId !== entry.indexVersionId);
      filtered.push(entry);
      this.entries.set(entry.chunkId, filtered);
    }
  }

  setActiveIndex(tenantId: string, indexVersionId: string): void {
    this.activeIndexByTenant.set(tenantId, indexVersionId);
  }

  registerVersion(
    tenantId: string,
    indexVersionId: string,
    info: { versionNumber: number; model: string; dimension: number },
  ): void {
    let versions = this.versionsByTenant.get(tenantId);
    if (!versions) {
      versions = new Map();
      this.versionsByTenant.set(tenantId, versions);
    }
    versions.set(indexVersionId, info);
  }

  search(
    tenantId: string,
    queryEmbedding: number[],
    options: {
      limit?: number;
      minScore?: number;
      documentIds?: string[];
      chunkIds?: string[];
    } = {},
  ): InMemoryVectorIndexEntry[] {
    const indexVersionId = this.activeIndexByTenant.get(tenantId);
    if (!indexVersionId) return [];
    const allEntries = Array.from(this.entries.values()).flat();
    const filtered = allEntries.filter((e) => {
      const entryTenant = (e as unknown as { tenantId?: string }).tenantId;
      if (entryTenant && entryTenant !== tenantId) return false;
      if (e.indexVersionId !== indexVersionId) return false;
      if (options.documentIds && options.documentIds.length > 0) {
        if (!options.documentIds.includes(e.documentId)) return false;
      }
      if (options.chunkIds && options.chunkIds.length > 0) {
        if (!options.chunkIds.includes(e.chunkId)) return false;
      }
      return true;
    });
    const scored = filtered.map((e) => ({
      entry: e,
      score: cosineSimilarity(queryEmbedding, e.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    const minScore = options.minScore ?? 0;
    return scored
      .filter((s) => s.score >= minScore)
      .slice(0, options.limit ?? 20)
      .map((s) => s.entry);
  }

  deleteByDocumentVersion(documentVersionId: string): number {
    let deleted = 0;
    for (const [chunkId, list] of this.entries.entries()) {
      const remaining = list.filter((e) => e.documentVersionId !== documentVersionId);
      deleted += list.length - remaining.length;
      if (remaining.length === 0) {
        this.entries.delete(chunkId);
      } else {
        this.entries.set(chunkId, remaining);
      }
    }
    return deleted;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
