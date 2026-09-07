import type { Result } from "../../domain/result";
import type { Chunk } from "../../domain/documents/documents.schema";
import type { RetrievalQuery, RetrievalResult } from "../../domain/retrieval/retrieval.schema";

export interface ChunksWithEmbeddings {
  chunk: Chunk;
  embedding: number[];
}

export interface IndexBuildResult {
  indexVersionId: string;
  upserted: number;
  durationMs: number;
}

export interface GraphTraversalPort {
  traverse(params: TraversalParams, tenantId: string): Promise<Result<unknown[]>>;
  findPaths(params: PathFindingParams, tenantId: string): Promise<Result<unknown[]>>;
  findConnectedEntities(
    entityId: string,
    depth: number,
    tenantId: string,
  ): Promise<Result<unknown[]>>;
}

export interface TraversalParams {
  seedEntityIds: string[];
  predicate?: string;
  maxDepth?: number;
  direction?: "outgoing" | "incoming" | "both";
  validAsOf?: string;
}

export interface TraversalResult {
  entityId: string;
  path: Array<{
    fromId: string;
    predicate: string;
    toId: string;
  }>;
  depth: number;
  factId?: string;
}

export interface PathFindingParams {
  startEntityId: string;
  endEntityId: string;
  maxHops?: number;
  predicates?: string[];
}

export interface PathResult {
  path: Array<{
    fromId: string;
    predicate: string;
    toId: string;
    factId?: string;
  }>;
  totalHops: number;
}

export interface ConnectedEntity {
  entityId: string;
  relationship: string;
  depth: number;
}

export interface HybridQueryPort {
  query(query: RetrievalQuery): Promise<
    Result<{
      queryId: string;
      strategy: RetrievalQuery["strategy"];
      results: RetrievalResult[];
      fusionTrace: Array<{
        strategy: string;
        inputs: number;
        fused: number;
        weight: number;
      }>;
      timing: {
        entityResolutionMs: number;
        embeddingMs: number;
        vectorSearchMs: number;
        fullTextSearchMs: number;
        graphSearchMs: number;
        fusionMs: number;
        rerankMs: number;
        totalMs: number;
      };
      indexVersion: unknown;
    }>
  >;
}
