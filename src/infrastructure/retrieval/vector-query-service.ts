import type {
  CitationBuilderPort,
  EmbeddingPort,
  FullTextSearchPort,
  GenerationRequest,
  GeneratorPort,
  RerankPort,
  RetrievalExecutionResult,
  RetrievalFusionPort,
  VectorIndexPort,
  VectorPipelineConfig,
  VectorQueryService,
} from "../../application/models/ports";
import { StructuredAnswerSchema } from "../../application/models/ports";
import type {
  RetrievalQuery,
  RetrievalResult,
  RetrievalStrategy,
} from "../../domain/retrieval/types";
import { success, failure, type Result } from "../../domain/result";
import { NotFoundError, ValidationError, InternalError } from "../../domain/errors";
import { withSpan, recordMetric } from "../telemetry";
import { traceFusion } from "../../infrastructure/postgres/fusion";

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

export class DefaultVectorQueryService implements VectorQueryService {
  constructor(private readonly deps: VectorQueryServiceDeps) {}

  async query(query: RetrievalQuery): Promise<Result<RetrievalExecutionResult>> {
    const startedAt = this.deps.clock();
    return withSpan(
      "vector.query",
      async () => {
        if (query.strategy === "graph" || query.strategy === "hybrid") {
          return failure(
            new ValidationError(
              "Default vector query service handles vector/fulltext strategies only",
              { strategy: query.strategy },
            ),
          );
        }
        const indexResult = await this.deps.vector.getActiveIndexVersion(query.tenantId);
        if (!indexResult.ok) return indexResult;
        const indexVersion = indexResult.value;
        if (!indexVersion) {
          return failure(new NotFoundError("Active index version", query.tenantId));
        }
        const expectedDim = this.deps.embedding.getDimension();
        if (indexVersion.embeddingDimension !== expectedDim) {
          return failure(
            new ValidationError(
              `Index dimension ${indexVersion.embeddingDimension} does not match embedding model dimension ${expectedDim}`,
            ),
          );
        }
        const embedResult = await this.deps.embedding.embedBatch({
          inputs: [query.question],
          tenantId: query.tenantId,
        });
        if (!embedResult.ok) return embedResult;
        const queryEmbedding = embedResult.value.embeddings[0]?.embedding;
        if (!queryEmbedding) {
          return failure(new InternalError("Embedding result missing for question"));
        }
        const embeddingMs = elapsed(startedAt, this.deps.clock);

        const resultsByStrategy = new Map<RetrievalStrategy, RetrievalResult[]>();
        const filter = {
          ...(query.filters?.documentIds ? { documentIds: query.filters.documentIds } : {}),
          ...(query.principalId ? { principalId: [query.principalId] } : {}),
        };
        const vectorResult = await this.deps.vector.search(queryEmbedding, query.tenantId, {
          indexVersionId: indexVersion.indexVersionId,
          limit: query.maxResults,
          ...(Object.keys(filter).length > 0 ? { filter } : {}),
        });
        if (!vectorResult.ok) return vectorResult;
        resultsByStrategy.set("vector", toRetrievalResults(vectorResult.value, "vector"));
        const vectorSearchMs = elapsed(startedAt, this.deps.clock);

        let fullTextSearchMs = 0;
        if (this.deps.fulltext && this.deps.config.enableFullText) {
          const ftResult = await this.deps.fulltext.search(query.question, query.tenantId, {
            limit: query.maxResults,
            ...(Object.keys(filter).length > 0 ? { filter } : {}),
          });
          if (!ftResult.ok) return ftResult;
          resultsByStrategy.set("fulltext", toRetrievalResults(ftResult.value, "fulltext"));
        }
        fullTextSearchMs = elapsed(startedAt, this.deps.clock);

        const fused = this.deps.fusion.fuse(resultsByStrategy, {
          weights: this.deps.config.fusionWeights,
          maxResults: this.deps.config.maxCandidates,
          dedupByChunkId: true,
        });
        if (!fused.ok) return fused;
        const fusionMs = elapsed(startedAt, this.deps.clock);

        let rerankMs = 0;
        let candidates = fused.value;
        if (this.deps.reranker && this.deps.config.enableRerank) {
          const rerankResult = await this.deps.reranker.rerank({
            query: query.question,
            candidates,
            topK: this.deps.config.maxCandidates,
          });
          if (!rerankResult.ok) return rerankResult;
          candidates = rerankResult.value;
        }
        rerankMs = elapsed(startedAt, this.deps.clock);

        const citationResult = await this.deps.citationBuilder.buildFromRetrieval(
          candidates,
          query.tenantId,
        );
        if (!citationResult.ok) return citationResult;
        const citations = citationResult.value;

        const fusionTrace = traceFusion(resultsByStrategy, candidates, {
          weights: this.deps.config.fusionWeights,
        });

        let generatedAnswer;
        if (this.deps.config.enableGeneration) {
          const genRequest = this.buildGenerationRequest(query, {
            queryId: this.deps.idGen(),
            strategy: query.strategy,
            results: candidates,
            citations,
            fusionTrace,
            timing: {
              embeddingMs,
              vectorSearchMs,
              fullTextSearchMs,
              fusionMs,
              rerankMs,
              totalMs: 0,
            },
            indexVersion,
          });
          const genResult = await this.deps.generator.generateStructured(genRequest);
          if (!genResult.ok) return failure(genResult.error);
          generatedAnswer = genResult.value.structured;
        }

        const totalMs = elapsed(startedAt, this.deps.clock);
        recordMetric("vector.query.totalMs", totalMs);
        recordMetric("vector.query.candidates", candidates.length);

        return success({
          queryId: this.deps.idGen(),
          strategy: query.strategy,
          results: candidates,
          citations,
          ...(generatedAnswer ? { generatedAnswer } : {}),
          fusionTrace,
          timing: {
            embeddingMs,
            vectorSearchMs,
            fullTextSearchMs,
            fusionMs,
            rerankMs,
            totalMs,
          },
          indexVersion,
        });
      },
      {
        attributes: {
          "vector.tenant_id": query.tenantId,
          "vector.strategy": query.strategy,
        },
      },
    );
  }

  buildGenerationRequest(
    query: RetrievalQuery,
    execution: RetrievalExecutionResult,
  ): GenerationRequest {
    return {
      question: query.question,
      evidence: execution.results,
      allowedCitationIds: execution.citations.map((c) => c.citationId),
      tenantId: query.tenantId,
      schema: StructuredAnswerSchema,
    };
  }
}

function toRetrievalResults(
  rows: Array<{
    chunkId: string;
    documentVersionId: string;
    documentId: string;
    content: string;
    locator: Record<string, unknown>;
    metadata: Record<string, unknown>;
    score: number;
  }>,
  strategy: RetrievalStrategy,
): RetrievalResult[] {
  return rows.map((row, idx) => ({
    id: `RES-${strategy}-${idx}-${row.chunkId.slice(0, 8)}`,
    strategy,
    score: row.score,
    chunkId: row.chunkId,
    content: row.content,
    metadata: {
      ...row.metadata,
      documentVersionId: row.documentVersionId,
      documentId: row.documentId,
      locator: row.locator,
    },
  }));
}

function elapsed(start: Date, now: () => Date): number {
  return Math.max(0, now().getTime() - start.getTime());
}
