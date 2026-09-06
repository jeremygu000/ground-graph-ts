import { z } from "zod";
import { generateObject } from "ai";
import type {
  LlmExtractorPort,
  LlmExtractionResult,
  ExtractionOptions,
} from "../../application/extraction/llm-extraction.types";
import type { Chunk } from "../../domain/documents/documents.schema";
import { InternalError } from "../../domain/errors";
import { type Result, success, failure } from "../../domain/result";

const ExtractionResultSchema = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      aliases: z.array(z.string()).optional(),
      confidence: z.number().min(0).max(1),
      description: z.string().optional(),
    }),
  ),
  facts: z.array(
    z.object({
      subjectName: z.string(),
      predicate: z.string(),
      objectName: z.string().optional(),
      objectValue: z.string().optional(),
      confidence: z.number().min(0).max(1),
      evidence: z.string().optional(),
    }),
  ),
  mentions: z.array(
    z.object({
      text: z.string(),
      startChar: z.number().int().nonnegative(),
      endChar: z.number().int().nonnegative(),
      entityName: z.string().optional(),
    }),
  ),
});

export class LlmExtractionAdapter implements LlmExtractorPort {
  constructor(private model: unknown) {}

  async extract(content: Chunk, options: ExtractionOptions): Promise<Result<LlmExtractionResult>> {
    const maxEntities = options.maxEntities ?? 10;
    const maxFacts = options.maxFacts ?? 20;

    const prompt = options.extractionPrompt ?? this.buildPrompt(content);

    try {
      const { object } = await generateObject({
        model: this.model as any,
        schema: ExtractionResultSchema,
        prompt,
      });

      const filteredEntities = (object.entities ?? []).slice(0, maxEntities);
      const filteredFacts = (object.facts ?? []).slice(0, maxFacts);

      return success({
        entities: filteredEntities,
        facts: filteredFacts,
        mentions: object.mentions ?? [],
      });
    } catch (error) {
      return failure(new InternalError("LLM extraction failed", error));
    }
  }

  private buildPrompt(content: Chunk): string {
    return `Extract structured entities and facts from the following content.

Content:
${content.content}

Extract up to 10 entities with their types and aliases.
Extract up to 20 facts with subject, predicate, and object.
Identify mentions with character positions.

Focus on:
- Service/API/Database/Queue names
- Dependencies and relationships
- Configuration values
- ADR references
`;
  }
}

export class NoopLlmExtractor implements LlmExtractorPort {
  async extract(
    _content: Chunk,
    _options: ExtractionOptions,
  ): Promise<Result<LlmExtractionResult>> {
    return success({
      entities: [],
      facts: [],
      mentions: [],
    });
  }
}
