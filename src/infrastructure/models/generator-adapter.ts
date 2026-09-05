import { generateText, generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type {
  GenerationConfig,
  GenerationRequest,
  GenerationResult,
  GeneratorPort,
  StructuredAnswer,
  GeneratorProvider,
} from "../../application/models/ports";
import { success, type Result } from "../../domain/result";
import { InternalError, NetworkError, ValidationError } from "../../domain/errors";
import { withSpan } from "../telemetry";
import { ZodStructuredOutputParser } from "./structured-output-parser";

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 60_000;

export interface OpenAIGeneratorConfig {
  provider?: GeneratorProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  organizationId?: string;
  defaultGeneration?: Partial<GenerationConfig>;
  maxRetries?: number;
  timeoutMs?: number;
}

export class OpenAIGeneratorAdapter implements GeneratorPort {
  private readonly config: OpenAIGeneratorConfig;
  private readonly resolvedMaxRetries: number;
  private readonly resolvedTimeoutMs: number;

  constructor(config: OpenAIGeneratorConfig) {
    if (!config.model) {
      throw new ValidationError("Generator model is required", { field: "model" });
    }
    this.config = { ...config };
    this.resolvedMaxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.resolvedTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getModel(): string {
    return this.config.model;
  }

  private resolveModel() {
    const provider = this.config.provider ?? "openai";
    if (provider !== "openai") {
      throw new ValidationError(
        `Provider "${provider}" is not supported by OpenAIGeneratorAdapter. Only "openai" is supported.`,
        { provider },
      );
    }
    return openai(this.config.model);
  }

  async generateStructured(request: GenerationRequest): Promise<Result<GenerationResult>> {
    return withSpan(
      "generator.structured",
      async () => {
        const prompt = this.buildPrompt(request);
        const parser = new ZodStructuredOutputParser<StructuredAnswer>(request.schema);
        const answer = await this.callGenerateObject(prompt, request.schema, parser);
        if (!answer.ok) {
          return answer;
        }
        const structured = answer.value.structured;
        const filtered = this.filterCitations(structured, request.allowedCitationIds);
        return success({
          structured: filtered,
          model: this.config.model,
          promptTokens: answer.value.promptTokens,
          completionTokens: answer.value.completionTokens,
          totalTokens: answer.value.totalTokens,
          finishReason: answer.value.finishReason,
          repairAttempts: answer.value.repairAttempts,
        });
      },
      {
        attributes: {
          "generator.model": this.config.model,
          "tenant.id": request.tenantId,
          "generator.evidence_count": String(request.evidence.length),
        },
      },
    );
  }

  private async callGenerateObject(
    prompt: { system: string; user: string },
    schema: z.ZodType<StructuredAnswer>,
    parser: ZodStructuredOutputParser<StructuredAnswer>,
  ): Promise<Result<GenerationResult>> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.resolvedMaxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.resolvedTimeoutMs);
      try {
        const result = await generateObject({
          model: this.resolveModel(),
          system: prompt.system,
          prompt: prompt.user,
          schema,
          temperature: this.config.defaultGeneration?.temperature ?? 0,
          maxOutputTokens: this.config.defaultGeneration?.maxTokens ?? 1024,
        });
        clearTimeout(timer);
        const rawText = JSON.stringify(result.object);
        let repairAttempted = false;
        let parsed = parser.parse(result.object);
        if (!parsed.ok) {
          repairAttempted = true;
          parsed = parser.parseWithRepair(result.object, rawText);
        }
        if (!parsed.ok) {
          lastError = parsed.error;
          continue;
        }
        const usage = result.usage ?? {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        };
        return success({
          structured: parsed.value,
          model: this.config.model,
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          finishReason: "stop",
          repairAttempts: repairAttempted ? 1 : 0,
        });
      } catch (err) {
        clearTimeout(timer);
        lastError = err as Error;
        if (attempt + 1 < this.resolvedMaxRetries) {
          continue;
        }
        if (
          err instanceof NetworkError ||
          err instanceof ValidationError ||
          err instanceof InternalError
        ) {
          return { ok: false, error: err };
        }
        return {
          ok: false,
          error: new NetworkError("Structured generation failed", err),
        };
      }
    }
    return {
      ok: false,
      error: new NetworkError(
        `Structured generation failed after ${this.resolvedMaxRetries} attempt(s)`,
        lastError,
      ),
    };
  }

  async generateRawCompletion(
    systemPrompt: string,
    userPrompt: string,
    overrides?: Partial<GenerationConfig>,
  ): Promise<
    Result<{ text: string; promptTokens: number; completionTokens: number; finishReason: string }>
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolvedTimeoutMs);
    try {
      const result = await generateText({
        model: this.resolveModel(),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: overrides?.temperature ?? 0,
        maxOutputTokens: overrides?.maxTokens ?? 512,
        abortSignal: controller.signal,
      });
      clearTimeout(timer);
      const usage = result.usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };
      return success({
        text: result.text,
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        finishReason: result.finishReason,
      });
    } catch (err) {
      clearTimeout(timer);
      return {
        ok: false,
        error: new NetworkError("Raw completion failed", err),
      };
    }
  }

  private buildPrompt(request: GenerationRequest): { system: string; user: string } {
    const allowedList = request.allowedCitationIds.map((id) => `- ${id}`).join("\n");
    const contextBlock = request.evidence
      .map((e) => {
        return `[${e.id}]\n${e.content}\nscore=${e.score.toFixed(3)}`;
      })
      .join("\n\n");
    const system =
      request.systemPrompt ??
      "You are a grounded answering system. Every factual claim MUST cite a citation id from the allowed list. Refuse to answer if the evidence does not support a claim. Output ONLY valid JSON matching the schema.";
    const user = [
      `Question: ${request.question}`,
      "",
      "Allowed citation ids (use exactly one per citation field):",
      allowedList || "(none)",
      "",
      "Evidence (each block is labeled with a citation id you may reference):",
      contextBlock,
      "",
      "Output JSON matching the schema.",
    ].join("\n");
    return { system, user };
  }

  private filterCitations(
    answer: StructuredAnswer,
    allowedCitationIds: string[],
  ): StructuredAnswer {
    const allowed = new Set(allowedCitationIds);
    const filteredClaims = answer.claims.map((claim) => ({
      ...claim,
      citations: claim.citations.filter((c) => allowed.has(c.citationId)),
    }));
    const claimsWithCitations = filteredClaims.filter((c) => c.citations.length > 0);
    const hasAnyClaim = claimsWithCitations.length > 0;
    const status: StructuredAnswer["status"] = hasAnyClaim
      ? "answered"
      : answer.status === "answered"
        ? "insufficient_evidence"
        : answer.status;
    return {
      ...answer,
      status,
      claims: hasAnyClaim ? claimsWithCitations : filteredClaims,
    };
  }
}
