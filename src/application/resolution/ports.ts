import type { CanonicalEntity, KnowledgeFact } from "../../domain/knowledge/types";
import type { Result } from "../../domain/result";

export interface ResolutionCandidate {
  mentionText: string;
  normalizedForm: string;
  possibleEntities: Array<{
    entity: CanonicalEntity;
    confidence: number;
  }>;
}

export interface ResolutionResult {
  mentionText: string;
  resolvedEntityId?: string;
  confidence: number;
  isAmbiguous: boolean;
  requiresReview: boolean;
}

export interface EntityResolutionPort {
  resolve(candidates: ResolutionCandidate[]): Promise<Result<ResolutionResult[]>>;
  disambiguate(
    mention: string,
    entities: CanonicalEntity[],
  ): Promise<Result<CanonicalEntity | null>>;
}

export interface OntologyPort {
  getEntityTypes(): Promise<Result<EntityType[]>>;
  getPredicates(): Promise<Result<Predicate[]>>;
  validateFact(fact: Partial<KnowledgeFact>): Promise<Result<ValidationResult>>;
  getSupercedes(predicate: string): Promise<Result<string[]>>;
}

export interface EntityType {
  name: string;
  description?: string;
  aliases: string[];
  validPredicates: string[];
}

export interface Predicate {
  name: string;
  description?: string;
  domainTypes: string[];
  rangeTypes: string[];
  isTransitive: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
