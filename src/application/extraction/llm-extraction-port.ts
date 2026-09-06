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

export const DEFAULT_RESOLUTION_BANDS: ResolutionBand[] = [
  { name: "high_confidence", minConfidence: 0.9, maxConfidence: 1.0, action: "create_entity" },
  { name: "medium_confidence", minConfidence: 0.7, maxConfidence: 0.9, action: "link_entity" },
  { name: "low_confidence", minConfidence: 0.5, maxConfidence: 0.7, action: "review" },
  { name: "very_low_confidence", minConfidence: 0.0, maxConfidence: 0.5, action: "reject" },
];

export function classifyMention(
  confidence: number,
  bands: ResolutionBand[] = DEFAULT_RESOLUTION_BANDS,
): ResolutionBand {
  const band = bands.find((b) => confidence >= b.minConfidence && confidence < b.maxConfidence);
  return band ?? bands[bands.length - 1]!;
}
