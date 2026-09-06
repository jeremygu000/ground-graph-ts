import type { GenerationConfig, GeneratorProvider } from "../../application/models/models.types";
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
