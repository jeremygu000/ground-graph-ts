import type { CanonicalEntity, KnowledgeFact, EntityMention } from "../../domain/knowledge/types";
import type { Result } from "../../domain/result";

export interface EntityRepository {
  create(entity: CanonicalEntity): Promise<Result<CanonicalEntity>>;
  findById(id: string, tenantId: string): Promise<Result<CanonicalEntity | null>>;
  findByCanonicalName(name: string, tenantId: string): Promise<Result<CanonicalEntity | null>>;
  findByAlias(alias: string, tenantId: string): Promise<Result<CanonicalEntity[]>>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<CanonicalEntity>,
  ): Promise<Result<CanonicalEntity>>;
  supersede(id: string, tenantId: string, supersededById: string): Promise<Result<void>>;
  listByType(
    entityType: string,
    tenantId: string,
    limit?: number,
    offset?: number,
  ): Promise<Result<CanonicalEntity[]>>;
  list(tenantId: string, limit?: number, offset?: number): Promise<Result<CanonicalEntity[]>>;
}

export interface FactRepository {
  create(fact: KnowledgeFact): Promise<Result<KnowledgeFact>>;
  createMany(facts: KnowledgeFact[]): Promise<Result<KnowledgeFact[]>>;
  findById(id: string, tenantId: string): Promise<Result<KnowledgeFact | null>>;
  findBySubject(subjectId: string, tenantId: string): Promise<Result<KnowledgeFact[]>>;
  findByPredicate(predicate: string, tenantId: string): Promise<Result<KnowledgeFact[]>>;
  findByStatus(status: KnowledgeFact["status"], tenantId: string): Promise<Result<KnowledgeFact[]>>;
  findTemporal(
    subjectId: string,
    predicate: string,
    tenantId: string,
    asOf: string,
  ): Promise<Result<KnowledgeFact | null>>;
  updateStatus(
    id: string,
    tenantId: string,
    status: KnowledgeFact["status"],
  ): Promise<Result<KnowledgeFact>>;
  supersede(id: string, tenantId: string, supersededById: string): Promise<Result<void>>;
}

export interface MentionRepository {
  create(mention: EntityMention): Promise<Result<EntityMention>>;
  createMany(mentions: EntityMention[]): Promise<Result<EntityMention[]>>;
  findByChunk(chunkId: string, tenantId: string): Promise<Result<EntityMention[]>>;
  findByEntity(entityId: string, tenantId: string): Promise<Result<EntityMention[]>>;
  findUnresolved(tenantId: string, limit?: number): Promise<Result<EntityMention[]>>;
}

export interface GraphProjectionPort {
  projectFact(fact: KnowledgeFact): Promise<Result<void>>;
  projectEntity(entity: CanonicalEntity): Promise<Result<void>>;
  removeFact(factId: string): Promise<Result<void>>;
  removeEntity(entityId: string): Promise<Result<void>>;
}
