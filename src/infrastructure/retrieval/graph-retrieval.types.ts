import type { GraphTraversalPort } from "../../application/retrieval/ports.types";
import type { Result } from "../../domain/result";
import type { RetrievalResult } from "../../domain/retrieval/retrieval.schema";
export interface GraphRetrievalOptions {
  maxDepth?: number;
  direction?: "outgoing" | "incoming" | "both";
  validAsOf?: string;
  factStatuses?: Array<"candidate" | "verified" | "rejected" | "superseded">;
  entityTypes?: string[];
  principalId?: string;
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
