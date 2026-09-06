import type { Chunk } from "../../domain/documents/documents.schema";
import type { EntityTypeRepository, PredicateRepository } from "../../../ontology/ports";

export interface ExtractionCandidate {
  entities: Array<{
    name: string;
    type: string;
    aliases?: string[];
    confidence: number;
  }>;
  facts: Array<{
    subjectName: string;
    predicate: string;
    objectName?: string;
    objectValue?: string;
    confidence: number;
  }>;
}

export interface DeterministicExtractor {
  extract(content: Chunk): ExtractionCandidate;
}

export interface ExtractionServiceDeps {
  entityTypeRepository: EntityTypeRepository;
  predicateRepository: PredicateRepository;
}
