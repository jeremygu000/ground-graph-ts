import type {
  CitationBuilderPort,
  EmbeddingPort,
  FullTextSearchPort,
  GeneratorPort,
  RerankPort,
  RetrievalFusionPort,
  VectorIndexPort,
  VectorPipelineConfig,
} from "../../application/models/models.types";
export interface VectorQueryServiceDeps {
  embedding: EmbeddingPort;
  vector: VectorIndexPort;
  fulltext: FullTextSearchPort | null;
  reranker: RerankPort | null;
  fusion: RetrievalFusionPort;
  generator: GeneratorPort;
  citationBuilder: CitationBuilderPort;
  config: VectorPipelineConfig;
  clock: () => Date;
  idGen: () => string;
}
