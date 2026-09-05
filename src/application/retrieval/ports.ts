import type {
  RetrievalQuery,
  RetrievalResult,
  RetrievalStrategy,
} from "../../domain/retrieval/types";
import type { Result } from "../../domain/result";
import type { Chunk } from "../../domain/documents/types";

export interface VectorIndexPort {
  upsert_embeddings(
    chunks: Chunk[],
    embeddings: number[][],
    tenantId: string,
  ): Promise<Result<void>>;
  search(
    queryEmbedding: number[],
    tenantId: string,
    options?: SearchOptions,
  ): Promise<Result<RetrievalResult[]>>;
  deleteByDocumentVersion(documentVersionId: string, tenantId: string): Promise<Result<void>>;
  getIndexVersion(tenantId: string): Promise<Result<string>>;
}

export interface SearchOptions {
  limit?: number;
  filter?: {
    documentIds?: string[];
    minScore?: number;
  };
  includeVector?: boolean;
}

export interface FullTextSearchPort {
  search(
    query: string,
    tenantId: string,
    options?: FullTextSearchOptions,
  ): Promise<Result<RetrievalResult[]>>;
}

export interface FullTextSearchOptions {
  limit?: number;
  filter?: {
    documentIds?: string[];
  };
}

export interface GraphTraversalPort {
  traverse(params: TraversalParams, tenantId: string): Promise<Result<TraversalResult[]>>;
  findPaths(params: PathFindingParams, tenantId: string): Promise<Result<PathResult[]>>;
  findConnectedEntities(
    entityId: string,
    depth: number,
    tenantId: string,
  ): Promise<Result<ConnectedEntity[]>>;
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

export interface RetrievalFusionPort {
  fuse(
    results: Map<RetrievalStrategy, RetrievalResult[]>,
    options?: FusionOptions,
  ): Promise<Result<RetrievalResult[]>>;
}

export interface FusionOptions {
  ratio?: number;
  maxResults?: number;
  diversityThreshold?: number;
}

export interface RetrievalPlanPort {
  createPlan(query: RetrievalQuery): Promise<Result<RetrievalPlan>>;
  estimateCost(plan: RetrievalPlan): Promise<Result<CostEstimate>>;
}

export interface RetrievalPlan {
  strategies: Array<{
    type: RetrievalStrategy;
    budget: number;
    steps: RetrievalPlanStep[];
  }>;
  totalEstimatedMs: number;
}

export interface RetrievalPlanStep {
  stepNumber: number;
  action: string;
  repository: string;
  parameters: Record<string, unknown>;
}

export interface CostEstimate {
  estimatedTokens: number;
  estimatedLatencyMs: number;
  estimatedCostUSD: number;
}
