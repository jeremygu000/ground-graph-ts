import type { EntityType, Predicate, OntologyConstraint, OntologyVersion } from "./types";
import type { Result } from "../src/domain/result";

export interface EntityTypeRepository {
  create(entityType: EntityType): Promise<Result<EntityType>>;
  findById(id: string, tenantId: string): Promise<Result<EntityType | null>>;
  findByName(name: string, tenantId: string): Promise<Result<EntityType | null>>;
  update(id: string, tenantId: string, updates: Partial<EntityType>): Promise<Result<EntityType>>;
  list(tenantId: string): Promise<Result<EntityType[]>>;
}

export interface PredicateRepository {
  create(predicate: Predicate): Promise<Result<Predicate>>;
  findById(id: string, tenantId: string): Promise<Result<Predicate | null>>;
  findByName(name: string, tenantId: string): Promise<Result<Predicate | null>>;
  update(id: string, tenantId: string, updates: Partial<Predicate>): Promise<Result<Predicate>>;
  list(tenantId: string): Promise<Result<Predicate[]>>;
}

export interface OntologyConstraintRepository {
  create(constraint: OntologyConstraint): Promise<Result<OntologyConstraint>>;
  findById(id: string, tenantId: string): Promise<Result<OntologyConstraint | null>>;
  update(id: string, tenantId: string, updates: Partial<OntologyConstraint>): Promise<Result<OntologyConstraint>>;
  list(tenantId: string): Promise<Result<OntologyConstraint[]>>;
}

export interface OntologyVersionRepository {
  create(version: OntologyVersion): Promise<Result<OntologyVersion>>;
  findLatest(tenantId: string): Promise<Result<OntologyVersion | null>>;
  findByVersion(version: number, tenantId: string): Promise<Result<OntologyVersion | null>>;
}
