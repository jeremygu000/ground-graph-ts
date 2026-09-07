import { embedMany } from "ai";
import { openai, createOpenAI } from "@ai-sdk/openai";
import type {
  EmbedBatchRequest,
  EmbedBatchResult,
  EmbeddingConfig,
  EmbeddingPort,
  EmbeddingResult,
} from "../../application/models/models.types";
import type { Result } from "../../domain/result";
import { success } from "../../domain/result";
import { InternalError, NetworkError, ValidationError } from "../../domain/errors";
import { withSpan } from "../telemetry";

const DEFAULT_BATCH_SIZE = 96;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BASE_MS = 200;

export class OpenAIEmbeddingAdapter implements EmbeddingPort {
  private readonly config: EmbeddingConfig;
  private readonly resolvedBatchSize: number;
  private readonly resolvedMaxRetries: number;
  private readonly resolvedTimeoutMs: number;

  constructor(config: EmbeddingConfig) {
    if (!config.model) {
      throw new ValidationError("Embedding model is required", { field: "model" });
    }
    if (config.dimension <= 0) {
      throw new ValidationError("Embedding dimension must be positive", { field: "dimension" });
    }
    if (
      config.provider !== "openai" &&
      config.provider !== "local" &&
      config.provider !== "openrouter"
    ) {
      throw new ValidationError("Unsupported embedding provider", { provider: config.provider });
    }
    this.config = { ...config };
    this.resolvedBatchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.resolvedMaxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.resolvedTimeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getDimension(): number {
    return this.config.dimension;
  }

  getModel(): string {
    return this.config.model;
  }

  async embedBatch(request: EmbedBatchRequest): Promise<Result<EmbedBatchResult>> {
    if (request.inputs.length === 0) {
      return success({
        embeddings: [],
        totalTokens: 0,
        model: this.config.model,
        dimension: this.config.dimension,
      });
    }
    for (let i = 0; i < request.inputs.length; i++) {
      if (typeof request.inputs[i] !== "string" || request.inputs[i] === "") {
        return {
          ok: false,
          error: new ValidationError(`Embedding input at index ${i} must be a non-empty string`),
        };
      }
    }
    return withSpan(
      "embedding.embedBatch",
      async () => {
        const all: EmbeddingResult[] = new Array(request.inputs.length);
        let totalTokens = 0;
        const batches = this.chunk(request.inputs, this.resolvedBatchSize);
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          if (!batch) continue;
          const offset = batchIndex * this.resolvedBatchSize;
          const batchResult = await this.embedBatchWithRetry(batch, offset);
          if (!batchResult.ok) {
            return batchResult;
          }
          for (let i = 0; i < batchResult.value.embeddings.length; i++) {
            const e = batchResult.value.embeddings[i];
            if (!e) continue;
            all[offset + i] = e;
          }
          totalTokens += batchResult.value.totalTokens;
        }
        return success({
          embeddings: all,
          totalTokens,
          model: this.config.model,
          dimension: this.config.dimension,
        });
      },
      {
        attributes: {
          "embedding.model": this.config.model,
          "embedding.dimension": String(this.config.dimension),
          "embedding.count": String(request.inputs.length),
          "tenant.id": request.tenantId,
        },
      },
    );
  }

  private async embedBatchWithRetry(
    inputs: string[],
    offset: number,
  ): Promise<Result<{ embeddings: EmbeddingResult[]; totalTokens: number }>> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.resolvedMaxRetries; attempt++) {
      try {
        const result = await this.callProvider(inputs);
        if (result.embeddings.length !== inputs.length) {
          throw new InternalError(
            `Embedding count mismatch: expected ${inputs.length}, got ${result.embeddings.length}`,
          );
        }
        const mapped: EmbeddingResult[] = result.embeddings.map((e, i) => ({
          embedding: e,
          index: offset + i,
          tokens: result.totalTokens,
          model: this.config.model,
          dimension: e.length,
        }));
        for (const item of mapped) {
          if (item.embedding.length !== this.config.dimension) {
            throw new InternalError(
              `Embedding dimension mismatch: expected ${this.config.dimension}, got ${item.embedding.length}`,
            );
          }
        }
        return success({ embeddings: mapped, totalTokens: result.totalTokens });
      } catch (err) {
        lastError = err as Error;
        if (attempt + 1 < this.resolvedMaxRetries && this.isRetryable(err)) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        if (
          err instanceof NetworkError ||
          err instanceof InternalError ||
          err instanceof ValidationError
        ) {
          return { ok: false, error: err };
        }
        return {
          ok: false,
          error: new NetworkError(`Embedding batch failed after ${attempt + 1} attempt(s)`, err),
        };
      }
    }
    return {
      ok: false,
      error: new NetworkError(
        `Embedding batch failed after ${this.resolvedMaxRetries} attempt(s)`,
        lastError,
      ),
    };
  }

  private async callProvider(
    inputs: string[],
  ): Promise<{ embeddings: number[][]; totalTokens: number }> {
    if (this.config.provider === "local") {
      return this.callLocal(inputs);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.resolvedTimeoutMs);
    try {
      let model;
      if (this.config.provider === "openrouter") {
        const baseURL = this.config.baseUrl ?? "https://openrouter.ai/api/v1";
        const openrouter = createOpenAI({ baseURL, apiKey: this.config.apiKey ?? "" });
        model = openrouter.embeddingModel(this.config.model);
      } else if (this.config.baseUrl) {
        const custom = createOpenAI({
          baseURL: this.config.baseUrl,
          apiKey: this.config.apiKey ?? "",
        });
        model = custom.embeddingModel(this.config.model);
      } else {
        model = openai.textEmbeddingModel(this.config.model);
      }
      const result = await embedMany({
        model,
        values: inputs,
        maxRetries: 0,
        abortSignal: controller.signal,
      });
      return {
        embeddings: result.embeddings.map((e) => Array.from(e)),
        totalTokens: result.usage?.tokens ?? 0,
      };
    } catch (err) {
      throw this.mapError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private callLocal(inputs: string[]): Promise<{ embeddings: number[][]; totalTokens: number }> {
    const dimension = this.config.dimension;
    const embeddings = inputs.map((text) => deterministicLocalEmbedding(text, dimension));
    return Promise.resolve({ embeddings, totalTokens: inputs.length * 4 });
  }

  private isRetryable(err: unknown): boolean {
    if (!(err instanceof Error)) return true;
    const msg = err.message.toLowerCase();
    if (msg.includes("abort") || msg.includes("timeout")) return false;
    if (msg.includes("validation") || msg.includes("invalid")) return false;
    return true;
  }

  private mapError(err: unknown): Error {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes("invalid api key") || msg.includes("authentication")) {
        return new InternalError("Invalid embedding provider credentials", err);
      }
      if (msg.includes("rate limit") || msg.includes("429")) {
        return new NetworkError("Embedding provider rate limited", err);
      }
      if (msg.includes("model") && msg.includes("not found")) {
        return new ValidationError("Embedding model not available", { cause: err.message });
      }
      return new NetworkError("Embedding provider call failed", err);
    }
    return new InternalError("Embedding provider call failed", err);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  private backoffMs(attempt: number): number {
    const jitter = Math.random() * 50;
    return RETRY_BASE_MS * Math.pow(2, attempt) + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function deterministicLocalEmbedding(text: string, dimension: number): number[] {
  if (dimension <= 0) {
    throw new InternalError("Local embedding dimension must be positive");
  }
  const vector = new Array<number>(dimension).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    const idx = (code * 2654435761) % dimension;
    const sign = (code & 1) === 0 ? 1 : -1;
    const cur = vector[idx] ?? 0;
    vector[idx] = cur + sign * (1 + (code % 7) / 7);
  }
  let norm = 0;
  for (const v of vector) {
    norm += v * v;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  for (let i = 0; i < vector.length; i++) {
    vector[i] = (vector[i] ?? 0) / norm;
  }
  return vector;
}
