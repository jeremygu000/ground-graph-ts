import type { RetrievalWorkflow as RetrievalWorkflowInterface } from "./workflow.types";
import type { HybridQueryPort } from "./ports.types";
import type { CitationBuilderPort, GeneratorPort } from "../models/models.types";
import { StructuredAnswerSchema } from "../models/models.schema";
import type { TracerPort } from "../observability/tracer-port.types";
import type {
  RetrievalWorkflowInput,
  RetrievalWorkflowResult,
  Citation,
  Claim,
} from "./workflow.types";

export class RetrievalService implements RetrievalWorkflowInterface {
  constructor(
    private readonly hybridQuery: HybridQueryPort,
    private readonly citationBuilder: CitationBuilderPort,
    private readonly generator: GeneratorPort,
    _tracer: TracerPort,
  ) {
    void _tracer;
  }

  async execute(input: RetrievalWorkflowInput): Promise<RetrievalWorkflowResult> {
    const startedAt = Date.now();
    const entityResolutionStarted = Date.now();

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

    const entityResolutionMs = Date.now() - entityResolutionStarted;

    const citationsResult = await this.citationBuilder.buildFromRetrieval(
      queryResult.value.results,
      input.tenantId,
    );

    if (!citationsResult.ok) {
      throw citationsResult.error;
    }

    const retrievalMs = Date.now() - startedAt - entityResolutionMs;

    const allowedCitationIds = citationsResult.value.map((c) => c.citationId);

    let generationResult = await this.generator.generateStructured({
      question: input.question,
      evidence: citationsResult.value,
      schema: StructuredAnswerSchema,
      allowedCitationIds,
      tenantId: input.tenantId,
    });

    if (!generationResult.ok) {
      throw generationResult.error;
    }

    if (generationResult.value.structured.status === "insufficient_evidence") {
      const retryQueryResult = await this.hybridQuery.query({
        question: input.question,
        tenantId: input.tenantId,
        principalId: input.principalId,
        strategy: input.strategy,
        filters: input.filters,
        maxResults: (input.maxResults ?? 20) * 2,
        maxHops: input.maxHops,
        budgets: input.budgets,
      });

      if (retryQueryResult.ok) {
        const retryCitationsResult = await this.citationBuilder.buildFromRetrieval(
          retryQueryResult.value.results,
          input.tenantId,
        );

        if (retryCitationsResult.ok) {
          const retryAllowedIds = retryCitationsResult.value.map((c) => c.citationId);

          generationResult = await this.generator.generateStructured({
            question: input.question,
            evidence: retryCitationsResult.value,
            schema: StructuredAnswerSchema,
            allowedCitationIds: retryAllowedIds,
            tenantId: input.tenantId,
          });

          if (!generationResult.ok) {
            throw generationResult.error;
          }
        }
      }
    }

    const generationMs = Date.now() - startedAt - entityResolutionMs - retrievalMs;
    const totalMs = Date.now() - startedAt;

    const gen = generationResult.value;
    const qr = queryResult.value;

    const result: RetrievalWorkflowResult = {
      queryId: qr.queryId,
      answer: gen.structured.answer,
      status: gen.structured.status,
      claims: gen.structured.claims.map(
        (claim: {
          claimId: string;
          claimText: string;
          citations: Citation[];
          confidence: number;
        }): Claim => ({
          claimId: claim.claimId,
          claimText: claim.claimText,
          citations: claim.citations.map((c: Citation): Citation => ({
            citationId: c.citationId,
            evidenceId: c.evidenceId,
            snippet: c.snippet,
            score: c.score,
          })),
          confidence: claim.confidence,
        }),
      ),
      strategiesUsed: [qr.strategy],
      fusionTrace: qr.fusionTrace,
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
