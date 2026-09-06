import type { VectorSearchOptions } from "../../application/models/models.types";
import type {
  RetrievalQuery,
  RetrievalResult,
  RetrievalStrategy,
} from "../../domain/retrieval/retrieval.schema";
import { success, failure, type Result } from "../../domain/result";
import { ValidationError, InternalError } from "../../domain/errors";
import { withSpan, recordMetric } from "../../infrastructure/telemetry";
import { traceFusion } from "../../infrastructure/postgres/fusion";
import type { EntityResolutionResult } from "../../application/retrieval/entity-resolver.types";
import type { HybridQueryResult, HybridQueryServiceDeps } from "./hybrid-query.types";

export class HybridQueryService {
  constructor(private readonly deps: HybridQueryServiceDeps) {}

  async query(query: RetrievalQuery): Promise<Result<HybridQueryResult>> {
    const startedAt = this.deps.clock();

    return withSpan(
      "hybrid.query",
      async () => {
        if (query.strategy !== "graph" && query.strategy !== "hybrid") {
          return failure(
            new ValidationError("Hybrid query service handles graph/hybrid strategies only", {
              strategy: query.strategy,
            }),
          );
        }

        const entityResolutionMs = this.deps.clock();
        const entityResult = await this.deps.entityResolver.resolveEntitiesFromQuery(
          query.question,
          query.tenantId,
        );
        const entityResolutionElapsed = this.deps.clock().getTime() - entityResolutionMs.getTime();

        if (!entityResult.ok) {
          return failure(entityResult.error);
        }

        const indexResult = await this.deps.vector.getActiveIndexVersion(query.tenantId);
        if (!indexResult.ok) return indexResult;
        const indexVersion = indexResult.value;

        const embedResult = await this.deps.embedding.embedBatch({
          inputs: [query.question],
          tenantId: query.tenantId,
        });
        if (!embedResult.ok) return embedResult;
        const queryEmbedding = embedResult.value.embeddings[0]?.embedding;
        if (!queryEmbedding) {
          return failure(new InternalError("Embedding result missing for question"));
        }
        const embeddingMs =
          this.deps.clock().getTime() - startedAt.getTime() - entityResolutionElapsed;

        const resultsByStrategy = new Map<RetrievalStrategy, RetrievalResult[]>();

        const vectorSearchMsBefore = this.deps.clock();
        const searchOptions: VectorSearchOptions = {
          limit: query.maxResults ?? 20,
        };
        if (indexVersion) {
          searchOptions.indexVersionId = indexVersion.indexVersionId;
        }
        const filter = this.buildFilter(query);
        if (filter) {
          searchOptions.filter = filter;
        }
        const vectorResult = await this.deps.vector.search(
          queryEmbedding,
          query.tenantId,
          searchOptions,
        );
        if (!vectorResult.ok) return vectorResult;
        resultsByStrategy.set("vector", this.toRetrievalResults(vectorResult.value, "vector"));
        const vectorSearchMs = this.deps.clock().getTime() - vectorSearchMsBefore.getTime();

        let fullTextSearchMs = 0;
        if (this.deps.fulltext && this.deps.config.enableFullText) {
          const fullTextSearchMsBefore = this.deps.clock();
          const ftFilter: { documentIds?: string[]; chunkIds?: string[]; principalId?: string[] } =
            {};
          if (query.filters?.documentIds) {
            ftFilter.documentIds = query.filters.documentIds;
          }
          if (query.principalId) {
            ftFilter.principalId = [query.principalId];
          }
          const ftResult = await this.deps.fulltext.search(query.question, query.tenantId, {
            limit: query.maxResults ?? 20,
            ...(Object.keys(ftFilter).length > 0 ? { filter: ftFilter } : {}),
          });
          if (!ftResult.ok) return ftResult;
          resultsByStrategy.set("fulltext", this.toRetrievalResults(ftResult.value, "fulltext"));
          fullTextSearchMs = this.deps.clock().getTime() - fullTextSearchMsBefore.getTime();
        }

        let graphSearchMs = 0;
        if (this.deps.graph && this.deps.config.enableGraph) {
          const graphSearchMsBefore = this.deps.clock();
          const graphResults = await this.executeGraphRetrieval(entityResult.value, query);
          if (!graphResults.ok) return graphResults;
          resultsByStrategy.set("graph", graphResults.value);
          graphSearchMs = this.deps.clock().getTime() - graphSearchMsBefore.getTime();
        }

        const fusionMsBefore = this.deps.clock();
        const fused = this.deps.fusion.fuse(resultsByStrategy, {
          weights: this.deps.config.fusionWeights,
          maxResults: this.deps.config.maxCandidates,
          dedupByChunkId: true,
        });
        if (!fused.ok) return fused;
        const fusionMs = this.deps.clock().getTime() - fusionMsBefore.getTime();

        let rerankMs = 0;
        let candidates = fused.value;
        if (this.deps.reranker && this.deps.config.enableRerank) {
          const rerankMsBefore = this.deps.clock();
          const rerankResult = await this.deps.reranker.rerank({
            query: query.question,
            candidates,
            topK: this.deps.config.maxCandidates,
          });
          if (!rerankResult.ok) return rerankResult;
          candidates = rerankResult.value;
          rerankMs = this.deps.clock().getTime() - rerankMsBefore.getTime();
        }

        const totalMs = this.deps.clock().getTime() - startedAt.getTime();
        recordMetric("hybrid.query.totalMs", totalMs);
        recordMetric("hybrid.query.candidates", candidates.length);

        return success({
          queryId: this.deps.idGen(),
          strategy: query.strategy,
          results: candidates,
          citations: [],
          entityResolution: entityResult.value,
          fusionTrace: traceFusion(resultsByStrategy, candidates, {
            weights: this.deps.config.fusionWeights,
          }),
          timing: {
            entityResolutionMs: entityResolutionElapsed,
            embeddingMs,
            vectorSearchMs,
            fullTextSearchMs,
            graphSearchMs,
            fusionMs,
            rerankMs,
            totalMs,
          },
          indexVersion,
        });
      },
      {
        attributes: {
          "hybrid.tenant_id": query.tenantId,
          "hybrid.strategy": query.strategy,
        },
      },
    );
  }

  private async executeGraphRetrieval(
    entityResolution: EntityResolutionResult,
    query: RetrievalQuery,
  ): Promise<Result<RetrievalResult[]>> {
    if (!this.deps.graph) {
      return success([]);
    }

    const allResults: RetrievalResult[] = [];
    const seedEntityIds = entityResolution.queryPlan.seedEntityIds;

    if (seedEntityIds.length === 0) {
      return success([]);
    }

    const maxDepth = Math.min(query.maxHops ?? 2, this.deps.config.maxGraphDepth);

    for (const entityId of seedEntityIds) {
      const graphOptions: { maxDepth: number; direction: "both"; validAsOf?: string } = {
        maxDepth,
        direction: "both",
      };
      if (query.filters?.timeRange?.validFrom) {
        graphOptions.validAsOf = query.filters.timeRange.validFrom;
      }
      const neighborsResult = await this.deps.graph.retrieveGraphNeighbors(
        entityId,
        query.tenantId,
        graphOptions,
      );

      if (neighborsResult.ok) {
        allResults.push(...neighborsResult.value);
      }

      if (allResults.length >= this.deps.config.graphTraversalBudget) {
        break;
      }
    }

    return success(allResults);
  }

  private buildFilter(query: RetrievalQuery): VectorSearchOptions["filter"] {
    const filter: VectorSearchOptions["filter"] = {};

    if (query.filters?.documentIds) {
      filter.documentIds = query.filters.documentIds;
    }

    if (query.principalId) {
      filter.principalId = [query.principalId];
    }

    return filter;
  }

  private toRetrievalResults(
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
    return rows.map((row) => ({
      id: this.deps.idGen(),
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
}
