import type {
  CitationOutput,
  EmbeddingPort,
  FullTextSearchPort,
  GeneratorPort,
  IndexVersionInfo,
  RerankPort,
  RetrievalFusionPort,
  VectorIndexPort,
} from "../../application/models/models.types";
import type {
  EntityResolutionResult,
  EntityResolverPort,
} from "../../application/retrieval/entity-resolver.types";
import type { RetrievalResult, RetrievalStrategy } from "../../domain/retrieval/retrieval.schema";
export interface HybridQueryServiceDeps {
  embedding: EmbeddingPort;
  vector: VectorIndexPort;
  fulltext: FullTextSearchPort | null;
  graph: import("./graph-retrieval.types").GraphRetrievalPort | null;
  reranker: RerankPort | null;
  fusion: RetrievalFusionPort;
  generator: GeneratorPort;
  entityResolver: EntityResolverPort;
  config: HybridPipelineConfig;
  clock: () => Date;
  idGen: () => string;
}
export interface HybridPipelineConfig {
  maxCandidates: number;
  enableFullText: boolean;
  enableRerank: boolean;
  enableGeneration: boolean;
  enableGraph: boolean;
  fusionWeights: Partial<Record<RetrievalStrategy, number>>;
  refusalMinCitations: number;
  refusalMinConfidence: number;
  maxGraphDepth: number;
  graphTraversalBudget: number;
}
export interface HybridQueryResult {
  queryId: string;
  strategy: RetrievalStrategy;
  results: RetrievalResult[];
  citations: CitationOutput[];
  entityResolution: EntityResolutionResult | null;
  generatedAnswer?: import("../../application/models/models.types").StructuredAnswer;
  fusionTrace: Array<{
    strategy: RetrievalStrategy;
    inputs: number;
    fused: number;
    weight: number;
  }>;
  timing: {
    entityResolutionMs: number;
    embeddingMs: number;
    vectorSearchMs: number;
    fullTextSearchMs: number;
    graphSearchMs: number;
    fusionMs: number;
    rerankMs: number;
    totalMs: number;
  };
  indexVersion: IndexVersionInfo | null;
}
