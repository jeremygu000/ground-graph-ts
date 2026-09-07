import type { HybridQueryPort } from "../../application/retrieval/ports.types";
import type { CitationBuilderPort, GeneratorPort } from "../../application/models/models.types";
import { StructuredAnswerSchema } from "../../application/models/models.schema";
import type { TracerPort } from "../../application/observability/tracer-port.types";
import type { RetrievalWorkflowInput, RetrievalWorkflowResult } from "./retrieval-workflow.types";

export class RetrievalWorkflow {
  constructor(
    private readonly hybridQuery: HybridQueryPort,
    private readonly citationBuilder: CitationBuilderPort,
    private readonly generator: GeneratorPort,
    private readonly tracer: TracerPort,
  ) {}

  async execute(input: RetrievalWorkflowInput): Promise<RetrievalWorkflowResult> {
    return await this.tracer.startActiveSpan("retrieval.workflow", async (rootSpan) => {
      const startedAt = Date.now();
      rootSpan.setAttribute("question.length", input.question.length);
      rootSpan.setAttribute("strategy", input.strategy);
      rootSpan.setAttribute("tenant.id", input.tenantId);

      const entityResolutionSpan = this.tracer.startSpan("retrieval.entity_resolution");
      const entityResolutionStarted = Date.now();
      entityResolutionSpan.setAttribute("entity_resolver.call", "resolveEntitiesFromQuery");

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
        entityResolutionSpan.setStatus("ERROR", queryResult.error.message);
        entityResolutionSpan.end();
        rootSpan.setStatus("ERROR", "Hybrid query failed");
        throw queryResult.error;
      }

      entityResolutionSpan.setAttribute("seed_entities.count", queryResult.value.strategy.length);
      entityResolutionSpan.setStatus("OK");
      entityResolutionSpan.end();

      const entityResolutionMs = Date.now() - entityResolutionStarted;

      const citationSpan = this.tracer.startSpan("retrieval.citations");
      citationSpan.setAttribute("results.count", queryResult.value.results.length);

      const citationsResult = await this.citationBuilder.buildFromRetrieval(
        queryResult.value.results,
        input.tenantId,
      );

      if (!citationsResult.ok) {
        citationSpan.setStatus("ERROR", citationsResult.error.message);
        citationSpan.end();
        rootSpan.setStatus("ERROR", "Citation building failed");
        throw citationsResult.error;
      }

      citationSpan.setAttribute("citations.count", citationsResult.value.length);
      citationSpan.setStatus("OK");
      citationSpan.end();

      const retrievalMs = Date.now() - startedAt - entityResolutionMs;

      const generationSpan = this.tracer.startSpan("retrieval.generation");
      generationSpan.setAttribute("evidence.count", citationsResult.value.length);

      const allowedCitationIds = citationsResult.value.map(
        (c: { citationId: string }) => c.citationId,
      );

      let generationResult = await this.generator.generateStructured({
        question: input.question,
        evidence: citationsResult.value,
        schema: StructuredAnswerSchema,
        allowedCitationIds,
        tenantId: input.tenantId,
      });

      if (!generationResult.ok) {
        generationSpan.setStatus("ERROR", generationResult.error.message);
        generationSpan.end();
        rootSpan.setStatus("ERROR", "Generation failed");
        throw generationResult.error;
      }

      if (generationResult.value.structured.status === "insufficient_evidence") {
        generationSpan.addEvent("retry_attempt", { attempt: 1, reason: "insufficient_evidence" });

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
            const retryAllowedIds = retryCitationsResult.value.map(
              (c: { citationId: string }) => c.citationId,
            );

            generationResult = await this.generator.generateStructured({
              question: input.question,
              evidence: retryCitationsResult.value,
              schema: StructuredAnswerSchema,
              allowedCitationIds: retryAllowedIds,
              tenantId: input.tenantId,
            });

            if (!generationResult.ok) {
              generationSpan.setStatus("ERROR", generationResult.error.message);
              generationSpan.end();
              rootSpan.setStatus("ERROR", "Generation retry failed");
              throw generationResult.error;
            }

            generationSpan.addEvent("retry_completed", {
              attempt: 2,
              citations: retryCitationsResult.value.length,
            });
          }
        }
      }

      generationSpan.setStatus("OK");
      generationSpan.end();

      const generationMs = Date.now() - startedAt - entityResolutionMs - retrievalMs;
      const totalMs = Date.now() - startedAt;

      rootSpan.setAttribute("timing.entity_resolution_ms", entityResolutionMs);
      rootSpan.setAttribute("timing.retrieval_ms", retrievalMs);
      rootSpan.setAttribute("timing.generation_ms", generationMs);
      rootSpan.setAttribute("timing.total_ms", totalMs);
      rootSpan.setAttribute("strategies.used", input.strategy);
      rootSpan.setAttribute("fusion.strategies_count", queryResult.value.fusionTrace.length);

      // At this point generationResult is guaranteed to be a success
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
            citations: Array<{
              citationId: string;
              evidenceId: string;
              snippet: string;
              score: number;
            }>;
            confidence: number;
          }) => ({
            claimId: claim.claimId,
            claimText: claim.claimText,
            citations: claim.citations.map(
              (c: { citationId: string; evidenceId: string; snippet: string; score: number }) => ({
                citationId: c.citationId,
                evidenceId: c.evidenceId,
                snippet: c.snippet,
                score: c.score,
              }),
            ),
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

      rootSpan.setStatus("OK");
      return result;
    });
  }
}
