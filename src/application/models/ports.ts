export interface ModelConfig {
  provider: "openai" | "azure" | "anthropic";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface EmbeddingConfig {
  provider: "openai" | "local";
  model: string;
  apiKey?: string;
  baseUrl?: string;
  dimension: number;
}

export interface EmbeddingResult {
  embedding: number[];
  tokens: number;
  model: string;
}
