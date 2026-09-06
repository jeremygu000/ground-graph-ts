import type { CanonicalEntity, KnowledgeFact } from "../../domain/knowledge/knowledge.schema";
export interface ValidationRule {
  name: string;
  validate(entity: CanonicalEntity, facts: KnowledgeFact[]): ValidationResult;
}
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}
export interface ValidationError {
  code: string;
  message: string;
  entityId?: string;
  factId?: string;
}
export interface ValidationWarning {
  code: string;
  message: string;
  entityId?: string;
  factId?: string;
}
