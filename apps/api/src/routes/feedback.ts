import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { FeedbackSubmissionSchema, type FeedbackSubmission } from "../schemas/feedback.schema";
import { createProblemDetail } from "../schemas/problem-detail.schema";

export interface FeedbackRouteDeps {}

export async function registerFeedbackRoutes(
  app: FastifyInstance,
  _deps: FeedbackRouteDeps,
): Promise<void> {
  app.post("/v1/feedback", {
    schema: {
      description: "Submit feedback for a query, claim, or citation",
      tags: ["feedback"],
      body: FeedbackSubmissionSchema,
      response: {
        201: z.object({ feedbackId: z.string() }).parse({ feedbackId: crypto.randomUUID() }),
        400: z.object({ type: z.string(), title: z.string(), status: z.number() }),
        500: z.object({ type: z.string(), title: z.string(), status: z.number() }),
      },
    },
    handler: async (request: FastifyRequest<{ Body: FeedbackSubmission }>, reply: FastifyReply) => {
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

      const body = request.body;

      if (body.tenantId !== authContext.tenantId) {
        return reply
          .status(403)
          .send(
            createProblemDetail(
              "https://groundgraph.ai/errors/forbidden",
              "Forbidden",
              403,
              "Cannot submit feedback for a different tenant",
            ),
          );
      }

      const feedbackId = crypto.randomUUID();

      return reply.status(201).send({
        feedbackId,
        queryId: body.queryId,
        target: body.target,
        rating: body.rating,
        comment: body.comment,
        createdAt: new Date().toISOString(),
      });
    },
  });
}
