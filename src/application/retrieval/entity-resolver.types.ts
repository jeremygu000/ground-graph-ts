import type { Result } from "../../domain/result";

export interface ResolvedEntity {
  entityId: string;
  canonicalName: string;
  entityType: string;
  confidence: number;
  mentionText: string;
}
export interface EntityResolutionResult {
  entities: ResolvedEntity[];
  queryPlan: QueryPlan;
}
export interface QueryPlan {
  strategy: "vector" | "fulltext" | "graph" | "hybrid";
  seedEntityIds: string[];
  relatedEntityIds: string[];
  budget: { vectorResults: number; fulltextResults: number; graphResults: number };
  reasoning: string;
}
export interface EntityResolverPort {
  resolveEntitiesFromQuery(
    question: string,
    tenantId: string,
  ): Promise<Result<EntityResolutionResult>>;
  extractEntityMentions(question: string): Array<{ text: string; start: number; end: number }>;
}
export interface EntityResolverDependencies {
  entityRepository: EntityRepositoryPort;
  clock: () => Date;
}
export interface EntityRepositoryPort {
  findByCanonicalName(
    name: string,
    tenantId: string,
  ): Promise<Result<Array<{ id: string; canonicalName: string; entityType: string }>>>;
  findByAlias(
    alias: string,
    tenantId: string,
  ): Promise<Result<Array<{ id: string; canonicalName: string; entityType: string }>>>;
  searchEntities(
    query: string,
    tenantId: string,
    limit?: number,
  ): Promise<
    Result<Array<{ id: string; canonicalName: string; entityType: string; score: number }>>
  >;
}
