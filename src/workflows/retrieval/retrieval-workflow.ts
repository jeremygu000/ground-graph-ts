import type { HybridQueryPort } from "../../application/retrieval/ports.types";
import type { CitationBuilderPort, GeneratorPort } from "../../application/models/models.types";
import type { RetrievalWorkflowInput, RetrievalWorkflowResult } from "./retrieval-workflow.types";

export class RetrievalWorkflow {
  constructor(
    private readonly hybridQuery: HybridQueryPort,
    private readonly citationBuilder: CitationBuilderPort,
    private readonly generator: GeneratorPort,
  ) {}

  async execute(input: RetrievalWorkflowInput): Promise<RetrievalWorkflowResult> {
    const startedAt = Date.now();

    const queryResult = await this.hybridQuery.query({
      question: input.question,
      tenantId: input.tenantId,
      principalId: input.principalId,
      strategy: input.strategy,
      filters: input.filters,
      maxResults: input.maxResults ?? 20,
      maxHops: input.maxHops,
      budgets: input.budgets,
    });

    if (!queryResult.ok) {
      throw queryResult.error;
    }

    const entityResolutionMs = Date.now() - startedAt;

    const citationsResult = await this.citationBuilder.buildFromRetrieval(
      queryResult.value.results,
      input.tenantId,
    );

    if (!citationsResult.ok) {
      throw citationsResult.error;
    }

    const retrievalMs = Date.now() - startedAt - entityResolutionMs;

    const allowedCitationIds = citationsResult.value.map(
      (c: { citationId: string }) => c.citationId,
    );

    const generationResult = await this.generator.generateStructured({
      question: input.question,
      evidence: citationsResult.value,
      schema: {} as any,
      allowedCitationIds,
      tenantId: input.tenantId,
    });

    const generationMs = Date.now() - startedAt - entityResolutionMs - retrievalMs;

    if (!generationResult.ok) {
      throw generationResult.error;
    }

    const totalMs = Date.now() - startedAt;

    const result: RetrievalWorkflowResult = {
      queryId: queryResult.value.queryId,
      answer: generationResult.value.structured.answer,
      status: generationResult.value.structured.status,
      claims: generationResult.value.structured.claims.map((claim) => ({
        claimId: claim.claimId,
        claimText: claim.claimText,
        citations: claim.citations.map((c) => ({
          evidenceId: c.evidenceId,
          snippet: c.snippet,
        })),
        confidence: claim.confidence,
      })),
      strategiesUsed: [queryResult.value.strategy],
      fusionTrace: queryResult.value.fusionTrace,
      timingMs: {
        entityResolution: entityResolutionMs,
        retrieval: retrievalMs,
        generation: generationMs,
        total: totalMs,
      },
    };

    if (input.traceId) {
      result.traceId = input.traceId;
    }

    return result;
  }
}
