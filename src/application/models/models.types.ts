import type { Result } from "../../domain/result";
import type { ZodIssue, ZodType } from "zod";
import type { Chunk, EvidenceReference } from "../../domain/documents/documents.schema";
import type {
  RetrievalQuery,
  RetrievalResult,
  RetrievalStrategy,
} from "../../domain/retrieval/retrieval.schema";

export type EmbeddingProvider = "openai" | "local" | "openrouter";
export type RerankerProvider = "openai" | "local" | "none";
export type GeneratorProvider = "openai" | "azure" | "anthropic" | "local" | "openrouter";

export interface ModelConfig {
  provider: GeneratorProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  dimension: number;
  batchSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface RerankerConfig {
  provider: RerankerProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  topK?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  index: number;
  tokens: number;
  model: string;
  dimension: number;
}

export interface EmbedBatchRequest {
  inputs: string[];
  tenantId: string;
}

export interface EmbedBatchResult {
  embeddings: EmbeddingResult[];
  totalTokens: number;
  model: string;
  dimension: number;
}

export interface EmbeddingPort {
  embedBatch(request: EmbedBatchRequest): Promise<Result<EmbedBatchResult>>;
  getDimension(): number;
  getModel(): string;
}

export interface RerankRequest {
  query: string;
  candidates: RetrievalResult[];
  topK?: number;
}

export interface RerankPort {
  rerank(request: RerankRequest): Promise<Result<RetrievalResult[]>>;
  getModel(): string;
}

export interface GenerationConfig {
  provider?: GeneratorProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  seed?: number;
}

export interface CitationOutput {
  citationId: string;
  evidenceId: string;
  chunkId: string;
  documentVersionId: string;
  locatorPath: string;
  snippet: string;
  startChar: number;
  endChar: number;
  score: number;
}

export interface ClaimOutput {
  claimId: string;
  claimText: string;
  citations: CitationOutput[];
  confidence: number;
  supportedBy: string[];
}

export interface StructuredAnswer {
  answer: string;
  status: "answered" | "insufficient_evidence" | "refused";
  claims: ClaimOutput[];
  refusalReason?: string;
}

export interface GenerationRequest {
  question: string;
  evidence: CitationOutput[];
  systemPrompt?: string;
  config?: Partial<GenerationConfig>;
  schema: ZodType<StructuredAnswer>;
  allowedCitationIds: string[];
  tenantId: string;
}

export interface GenerationResult {
  structured: StructuredAnswer;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: "stop" | "length" | "content_filter" | "error" | "tool_calls";
  repairAttempts: number;
  rawOutput?: string;
}

export interface GeneratorPort {
  generateStructured(request: GenerationRequest): Promise<Result<GenerationResult>>;
  getModel(): string;
}

export interface StructuredOutputParser<T> {
  schema: ZodType<T>;
  parse(input: unknown): Result<T>;
  parseWithRepair(input: unknown, rawText: string): Result<T>;
}

export interface RepairStrategy {
  attempt(rawText: string, issues: ZodIssue[]): string;
}

export interface IndexVersionInfo {
  indexVersionId: string;
  versionNumber: number;
  embeddingModel: string;
  embeddingDimension: number;
  isActive: boolean;
  tenantId: string;
}

export interface VectorIndexPort {
  getActiveIndexVersion(tenantId: string): Promise<Result<IndexVersionInfo | null>>;
  upsertEmbeddings(
    chunks: Chunk[],
    embeddings: number[][],
    indexVersionId: string,
    tenantId: string,
  ): Promise<Result<{ upserted: number; indexVersionId: string }>>;
  search(
    queryEmbedding: number[],
    tenantId: string,
    options: VectorSearchOptions,
  ): Promise<Result<VectorSearchResultRow[]>>;
  deleteByDocumentVersion(
    documentVersionId: string,
    tenantId: string,
  ): Promise<Result<{ deleted: number }>>;
}

export interface VectorSearchOptions {
  indexVersionId?: string;
  limit?: number;
  minScore?: number;
  filter?: {
    documentIds?: string[];
    chunkIds?: string[];
    principalId?: string[];
  };
  includeEmbeddings?: boolean;
}

export interface VectorSearchResultRow {
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  score: number;
  embedding?: number[];
  indexVersionId: string;
  embeddingModel: string;
}

export interface FullTextSearchPort {
  search(
    query: string,
    tenantId: string,
    options: FullTextSearchOptions,
  ): Promise<Result<FullTextSearchResultRow[]>>;
  rebuildIndex(
    tenantId: string,
    documentVersionIds: string[],
  ): Promise<Result<{ rebuilt: number }>>;
}

export interface FullTextSearchOptions {
  limit?: number;
  filter?: {
    documentIds?: string[];
    chunkIds?: string[];
    principalId?: string[];
  };
  language?: string;
  useWebSearch?: boolean;
}

export interface FullTextSearchResultRow {
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  score: number;
  rank: number;
  headline: string;
}

export interface RetrievalFusionPort {
  fuse(
    resultsByStrategy: Map<RetrievalStrategy, RetrievalResult[]>,
    options?: FusionOptions,
  ): Result<RetrievalResult[]>;
}

export interface FusionOptions {
  weights?: Partial<Record<RetrievalStrategy, number>>;
  maxResults?: number;
  dedupByChunkId?: boolean;
}

export interface FusionTrace {
  strategy: RetrievalStrategy;
  inputs: number;
  fused: number;
  weight: number;
}

export interface CitationBuilderPort {
  buildFromRetrieval(
    results: RetrievalResult[],
    tenantId: string,
  ): Promise<Result<CitationOutput[]>>;
  buildEvidenceReferences(citations: CitationOutput[]): EvidenceReference[];
}

export interface VectorQueryService {
  query(query: RetrievalQuery): Promise<Result<RetrievalExecutionResult>>;
}

export interface RetrievalExecutionResult {
  queryId: string;
  strategy: RetrievalStrategy;
  results: RetrievalResult[];
  citations: CitationOutput[];
  generatedAnswer?: StructuredAnswer;
  fusionTrace: FusionTrace[];
  timing: {
    embeddingMs: number;
    vectorSearchMs: number;
    fullTextSearchMs: number;
    fusionMs: number;
    rerankMs: number;
    totalMs: number;
  };
  indexVersion: IndexVersionInfo | null;
}

export interface VectorPipelineConfig {
  embedding: EmbeddingConfig;
  reranker: RerankerConfig;
  generator: GenerationConfig;
  maxCandidates: number;
  enableFullText: boolean;
  enableRerank: boolean;
  enableGeneration: boolean;
  fusionWeights: Partial<Record<RetrievalStrategy, number>>;
  refusalMinCitations: number;
  refusalMinConfidence: number;
}
