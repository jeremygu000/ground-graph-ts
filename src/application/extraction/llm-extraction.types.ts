import type { Result } from "../../domain/result";
import type { Chunk } from "../../domain/documents/documents.schema";
export interface LlmExtractorPort {
  extract(content: Chunk, options: ExtractionOptions): Promise<Result<LlmExtractionResult>>;
}
export interface ExtractionOptions {
  tenantId: string;
  principalId: string;
  extractionPrompt?: string;
  maxEntities?: number;
  maxFacts?: number;
}
export interface LlmExtractionResult {
  entities: Array<{
    name: string;
    type: string;
    aliases?: string[] | undefined;
    confidence: number;
    description?: string | undefined;
  }>;
  facts: Array<{
    subjectName: string;
    predicate: string;
    objectName?: string | undefined;
    objectValue?: string | undefined;
    confidence: number;
    evidence?: string | undefined;
  }>;
  mentions: Array<{
    text: string;
    startChar: number;
    endChar: number;
    entityName?: string | undefined;
  }>;
}
export interface ResolutionBand {
  name: string;
  minConfidence: number;
  maxConfidence: number;
  action: "create_entity" | "link_entity" | "review" | "reject";
}
