import { randomUUID } from "node:crypto";
import type {
  GraphTraversalPort,
  TraversalParams,
  TraversalResult,
  PathResult,
  ConnectedEntity,
} from "../../application/retrieval/ports.types";
import type { RetrievalResult, RetrievalStrategy } from "../../domain/retrieval/retrieval.schema";
import { success, failure, type Result } from "../../domain/result";

export interface GraphRetrievalOptions {
  maxDepth?: number;
  direction?: "outgoing" | "incoming" | "both";
  validAsOf?: string;
  factStatuses?: Array<"candidate" | "verified" | "rejected" | "superseded">;
  entityTypes?: string[];
}

export interface GraphRetrievalPort {
  retrieveGraphNeighbors(
    entityId: string,
    tenantId: string,
    options?: GraphRetrievalOptions,
  ): Promise<Result<RetrievalResult[]>>;

  retrieveGraphPaths(
    startEntityId: string,
    endEntityId: string,
    tenantId: string,
    maxHops?: number,
  ): Promise<Result<RetrievalResult[]>>;

  retrieveConnectedEntities(
    entityId: string,
    depth: number,
    tenantId: string,
  ): Promise<Result<RetrievalResult[]>>;
}

export interface GraphRetrievalDependencies {
  graph: GraphTraversalPort;
  clock: () => Date;
  idGen: () => string;
}

export class DefaultGraphRetrievalAdapter implements GraphRetrievalPort {
  constructor(private readonly deps: GraphRetrievalDependencies) {}

  async retrieveGraphNeighbors(
    entityId: string,
    tenantId: string,
    options?: GraphRetrievalOptions,
  ): Promise<Result<RetrievalResult[]>> {
    const params: TraversalParams = {
      seedEntityIds: [entityId],
      maxDepth: options?.maxDepth ?? 2,
      direction: options?.direction ?? "both",
      ...(options?.validAsOf ? { validAsOf: options.validAsOf } : {}),
    };

    const result = await this.deps.graph.traverse(params, tenantId);
    if (!result.ok) {
      return failure(result.error);
    }

    const retrievalResults: RetrievalResult[] = (result.value as TraversalResult[]).map(
      (traversal) => ({
        id: randomUUID(),
        strategy: "graph" as RetrievalStrategy,
        score: 1.0 / (1 + traversal.depth),
        entityId: traversal.entityId,
        content: "",
        metadata: {
          traversalDepth: traversal.depth,
          path: traversal.path,
          factId: traversal.factId,
          validAsOf: options?.validAsOf,
        },
      }),
    );

    return success(retrievalResults);
  }

  async retrieveGraphPaths(
    startEntityId: string,
    endEntityId: string,
    tenantId: string,
    maxHops?: number,
  ): Promise<Result<RetrievalResult[]>> {
    const result = await this.deps.graph.findPaths(
      {
        startEntityId,
        endEntityId,
        maxHops: maxHops ?? 3,
      },
      tenantId,
    );

    if (!result.ok) {
      return failure(result.error);
    }

    const retrievalResults: RetrievalResult[] = (result.value as PathResult[]).map(
      (pathResult) => ({
        id: randomUUID(),
        strategy: "graph" as RetrievalStrategy,
        score: 1.0 / (1 + pathResult.totalHops),
        content: "",
        metadata: {
          totalHops: pathResult.totalHops,
          path: pathResult.path,
        },
      }),
    );

    return success(retrievalResults);
  }

  async retrieveConnectedEntities(
    entityId: string,
    depth: number,
    tenantId: string,
  ): Promise<Result<RetrievalResult[]>> {
    const result = await this.deps.graph.findConnectedEntities(entityId, depth, tenantId);
    if (!result.ok) {
      return failure(result.error);
    }

    const retrievalResults: RetrievalResult[] = (result.value as ConnectedEntity[]).map(
      (connected) => ({
        id: randomUUID(),
        strategy: "graph" as RetrievalStrategy,
        score: 1.0 / (1 + connected.depth),
        entityId: connected.entityId,
        content: "",
        metadata: {
          relationship: connected.relationship,
          depth: connected.depth,
        },
      }),
    );

    return success(retrievalResults);
  }
}
