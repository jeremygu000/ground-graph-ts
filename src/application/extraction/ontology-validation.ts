import type { CanonicalEntity, KnowledgeFact } from "../../domain/knowledge/knowledge.schema";
import type {
  ValidationError,
  ValidationResult,
  ValidationRule,
  ValidationWarning,
} from "./ontology-validation.types";

export class OntologyValidationService {
  private rules: ValidationRule[] = [
    new TemporalConsistencyRule(),
    new ProvenanceRequiredRule(),
    new EntityUniquenessRule(),
    new AliasUniquenessRule(),
    new FactCardinalityRule(),
  ];

  validate(entity: CanonicalEntity, facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const rule of this.rules) {
      const result = rule.validate(entity, facts);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }
}

class TemporalConsistencyRule implements ValidationRule {
  name = "temporal_consistency";

  validate(entity: CanonicalEntity, facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (entity.validTo && entity.validFrom) {
      const validFrom = new Date(entity.validFrom);
      const validTo = new Date(entity.validTo);
      if (validTo <= validFrom) {
        errors.push({
          code: "TEMPORAL_INVALID",
          message: "validTo must be greater than validFrom",
          entityId: entity.id,
        });
      }
    }

    for (const fact of facts) {
      if (fact.validTo && fact.validFrom) {
        const validFrom = new Date(fact.validFrom);
        const validTo = new Date(fact.validTo);
        if (validTo <= validFrom) {
          errors.push({
            code: "FACT_TEMPORAL_INVALID",
            message: "Fact validTo must be greater than validFrom",
            factId: fact.id,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

class ProvenanceRequiredRule implements ValidationRule {
  name = "provenance_required";

  validate(_entity: CanonicalEntity, facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (const fact of facts) {
      if (fact.status === "verified") {
        const hasProvenance = fact.provenance.chunkId || fact.provenance.evidenceText;
        if (!hasProvenance) {
          errors.push({
            code: "PROVENANCE_MISSING",
            message: "Verified facts require provenance (chunkId or evidenceText)",
            factId: fact.id,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

class EntityUniquenessRule implements ValidationRule {
  name = "entity_uniqueness";

  validate(entity: CanonicalEntity, _facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (entity.supersededBy === entity.id) {
      errors.push({
        code: "SELF_SUPERSESSION",
        message: "Entity cannot supersede itself",
        entityId: entity.id,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

class AliasUniquenessRule implements ValidationRule {
  name = "alias_uniqueness";

  validate(entity: CanonicalEntity, _facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const aliases = entity.aliases ?? [];
    const uniqueAliases = new Set(aliases);
    if (aliases.length !== uniqueAliases.size) {
      warnings.push({
        code: "DUPLICATE_ALIASES",
        message: "Entity has duplicate aliases",
        entityId: entity.id,
      });
    }

    if (aliases.includes(entity.canonicalName)) {
      warnings.push({
        code: "ALIAS_MATCHES_CANONICAL",
        message: "Canonical name is also listed as an alias",
        entityId: entity.id,
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

class FactCardinalityRule implements ValidationRule {
  name = "fact_cardinality";

  validate(_entity: CanonicalEntity, facts: KnowledgeFact[]): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const factCounts = new Map<string, number>();
    for (const fact of facts) {
      const key = `${fact.subjectId}:${fact.predicate}`;
      factCounts.set(key, (factCounts.get(key) ?? 0) + 1);
    }

    for (const [key, count] of factCounts) {
      if (count > 1) {
        const activeFacts = facts.filter((f) => {
          const k = `${f.subjectId}:${f.predicate}`;
          return k === key && f.status !== "superseded";
        });
        if (activeFacts.length > 1) {
          warnings.push({
            code: "MULTIPLE_ACTIVE_FACTS",
            message: `Multiple active facts for ${key}`,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
