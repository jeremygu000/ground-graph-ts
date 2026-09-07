import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  QueryRequestSchema,
  QueryResponseSchema,
  QueryErrorSchema,
  type QueryRequest,
  type QueryResponse,
} from "../schemas/query.schema";
import type { RetrievalWorkflow } from "../../../../src/application/retrieval/workflow.types";
import { createProblemDetail, INTERNAL_ERROR_TYPE } from "../schemas/problem-detail.schema";

export interface QueryRouteDeps {
  retrievalWorkflow: RetrievalWorkflow;
}

export async function registerQueryRoutes(
  app: FastifyInstance,
  deps: QueryRouteDeps,
): Promise<void> {
  app.post("/v1/query", {
    schema: {
      description: "Execute a retrieval query and generate an answer with citations",
      tags: ["query"],
      body: QueryRequestSchema,
      response: {
        200: QueryResponseSchema,
        400: QueryErrorSchema,
        401: QueryErrorSchema,
        500: QueryErrorSchema,
      },
    },
    handler: async (request: FastifyRequest<{ Body: QueryRequest }>, reply: FastifyReply) => {
      const { retrievalWorkflow } = deps;

      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              "https://groundgraph.ai/errors/unauthorized",
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const body: Parameters<RetrievalWorkflow["execute"]>[0] = {
        ...request.body,
        tenantId: authContext.tenantId,
        principalId: authContext.principalId,
      } as Parameters<RetrievalWorkflow["execute"]>[0];

      try {
        const result = await retrievalWorkflow.execute(body);

        return reply.status(200).send({
          queryId: result.queryId,
          answer: result.answer,
          status: result.status,
          claims: result.claims,
          strategiesUsed: result.strategiesUsed,
          fusionTrace: result.fusionTrace,
          timingMs: result.timingMs,
          traceId: result.traceId,
        } satisfies QueryResponse);
      } catch (error) {
        request.log.error(error);

        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              error instanceof Error ? error.message : "An unexpected error occurred",
            ),
          );
      }
    },
  });
}
