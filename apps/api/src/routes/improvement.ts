import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateProposalRequestSchema,
  SubmitProposalRequestSchema,
  ListProposalsRequestSchema,
  ApproveProposalRequestSchema,
  RejectProposalRequestSchema,
  AdvanceRolloutRequestSchema,
  RollbackProposalRequestSchema,
  CreateDriftReportRequestSchema,
  ReviewDriftReportRequestSchema,
  ListDriftReportsRequestSchema,
  ProposalResponseSchema,
  ListProposalsResponseSchema,
  DriftReportResponseSchema,
  ListDriftReportsResponseSchema,
  ImprovementMetricsResponseSchema,
  type CreateProposalRequest,
  type ListProposalsRequest,
  type CreateDriftReportRequest,
  type ListDriftReportsRequest,
} from "../schemas/improvement.schema";
import {
  createProblemDetail,
  UNAUTHORIZED_ERROR_TYPE,
  FORBIDDEN_ERROR_TYPE,
  NOT_FOUND_ERROR_TYPE,
  INTERNAL_ERROR_TYPE,
} from "../schemas/problem-detail.schema";
import type { ImprovementPort } from "../../../../src/application/improvement/improvement.types";
import type {
  CreateProposalInput,
  DriftFilters,
  ProposalFilters,
} from "../../../../src/application/improvement/improvement.types";
import {
  CreateProposalUseCase,
  SubmitProposalUseCase,
  ApproveProposalUseCase,
  RejectProposalUseCase,
  AdvanceRolloutUseCase,
  RollbackProposalUseCase,
  GetProposalUseCase,
  ListProposalsUseCase,
  CreateDriftReportUseCase,
  ListDriftReportsUseCase,
  ReviewDriftReportUseCase,
  GetImprovementMetricsUseCase,
} from "../../../../src/application/improvement/improvement.usecase";
import { isImprovementError } from "../../../../src/application/improvement/improvement.error";

export interface ImprovementRouteDeps {
  improvementPort: ImprovementPort;
}

function mapProposalToResponse(proposal: ReturnType<typeof ProposalResponseSchema.parse>) {
  return proposal;
}

export async function registerImprovementRoutes(
  app: FastifyInstance,
  deps: ImprovementRouteDeps,
): Promise<void> {
  const { improvementPort } = deps;

  const createProposalUC = new CreateProposalUseCase(improvementPort);
  const submitProposalUC = new SubmitProposalUseCase(improvementPort);
  const approveProposalUC = new ApproveProposalUseCase(improvementPort);
  const rejectProposalUC = new RejectProposalUseCase(improvementPort);
  const advanceRolloutUC = new AdvanceRolloutUseCase(improvementPort);
  const rollbackProposalUC = new RollbackProposalUseCase(improvementPort);
  const getProposalUC = new GetProposalUseCase(improvementPort);
  const listProposalsUC = new ListProposalsUseCase(improvementPort);
  const createDriftReportUC = new CreateDriftReportUseCase(improvementPort);
  const listDriftReportsUC = new ListDriftReportsUseCase(improvementPort);
  const reviewDriftReportUC = new ReviewDriftReportUseCase(improvementPort);
  const getMetricsUC = new GetImprovementMetricsUseCase(improvementPort);

  app.post("/v1/improvement/proposals", {
    schema: {
      description: "Create a new improvement proposal",
      tags: ["improvement"],
      body: CreateProposalRequestSchema,
      response: {
        201: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Body: CreateProposalRequest }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const body = request.body as CreateProposalRequest;
      const proposalInput: CreateProposalInput = {
        title: body.title,
        description: body.description,
        type: body.type,
        change: body.change,
        evidence: body.evidence,
        tenantId: authContext.tenantId,
      };
      if (body.clusterId !== undefined) {
        proposalInput.clusterId = body.clusterId;
      }
      const result = await createProposalUC.execute(proposalInput);

      if (!result.ok) {
        const status =
          isImprovementError(result.error) && result.error.code === "VALIDATION_ERROR" ? 400 : 500;
        return reply
          .status(status)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              status,
              result.error.message,
            ),
          );
      }

      return reply
        .status(201)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.post("/v1/improvement/proposals/:id/submit", {
    schema: {
      description: "Submit a draft proposal for approval",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: SubmitProposalRequestSchema,
      response: {
        200: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        409: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await submitProposalUC.execute({
        proposalId: request.params.id,
        tenantId: authContext.tenantId,
        submittedBy: authContext.principalId ?? "unknown",
      });

      if (!result.ok) {
        if (isImprovementError(result.error)) {
          if (result.error.code === "PROPOSAL_NOT_FOUND") {
            return reply
              .status(404)
              .send(
                createProblemDetail(
                  NOT_FOUND_ERROR_TYPE,
                  "Not Found",
                  404,
                  `Proposal ${request.params.id} not found`,
                ),
              );
          }
          if (result.error.code === "FORBIDDEN") {
            return reply
              .status(403)
              .send(
                createProblemDetail(
                  FORBIDDEN_ERROR_TYPE,
                  "Forbidden",
                  403,
                  "Access denied to the requested proposal",
                ),
              );
          }
          if (result.error.code === "PROPOSAL_NOT_DRAFT") {
            return reply
              .status(409)
              .send(
                createProblemDetail(
                  "https://groundgraph.ai/errors/conflict",
                  "Conflict",
                  409,
                  result.error.message,
                ),
              );
          }
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.get("/v1/improvement/proposals", {
    schema: {
      description: "List improvement proposals",
      tags: ["improvement"],
      querystring: ListProposalsRequestSchema,
      response: {
        200: ListProposalsResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: ListProposalsRequest }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const query = request.query as ListProposalsRequest;
      if (authContext.tenantId !== query.tenantId) {
        return reply
          .status(403)
          .send(
            createProblemDetail(
              FORBIDDEN_ERROR_TYPE,
              "Forbidden",
              403,
              "Access denied to the requested tenant",
            ),
          );
      }

      const filters: ProposalFilters = { tenantId: query.tenantId };
      if (query.status !== undefined) filters.status = query.status;
      if (query.type !== undefined) filters.type = query.type;
      if (query.rolloutStage !== undefined) filters.rolloutStage = query.rolloutStage;
      if (query.clusterId !== undefined) filters.clusterId = query.clusterId;

      const result = await listProposalsUC.execute(filters);
      if (!result.ok) {
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply.status(200).send({
        proposals: result.value.map((p) => ProposalResponseSchema.parse(p)),
        total: result.value.length,
      });
    },
  });

  app.get("/v1/improvement/proposals/:id", {
    schema: {
      description: "Get a proposal by ID",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: ProposalResponseSchema,
        401: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await getProposalUC.execute(request.params.id, authContext.tenantId);
      if (!result.ok) {
        if (isImprovementError(result.error) && result.error.code === "PROPOSAL_NOT_FOUND") {
          return reply
            .status(404)
            .send(
              createProblemDetail(
                NOT_FOUND_ERROR_TYPE,
                "Not Found",
                404,
                `Proposal ${request.params.id} not found`,
              ),
            );
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      if (result.value.tenantId !== authContext.tenantId) {
        return reply
          .status(403)
          .send(
            createProblemDetail(
              FORBIDDEN_ERROR_TYPE,
              "Forbidden",
              403,
              "Access denied to the requested proposal",
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.post("/v1/improvement/proposals/:id/approve", {
    schema: {
      description: "Approve a proposal",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: ApproveProposalRequestSchema,
      response: {
        200: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        409: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Body: { proposalId: string } }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await approveProposalUC.execute({
        proposalId: request.params.id,
        tenantId: authContext.tenantId,
        approvedBy: authContext.principalId ?? "unknown",
      });

      if (!result.ok) {
        if (isImprovementError(result.error)) {
          if (result.error.code === "PROPOSAL_NOT_FOUND") {
            return reply
              .status(404)
              .send(
                createProblemDetail(
                  NOT_FOUND_ERROR_TYPE,
                  "Not Found",
                  404,
                  `Proposal ${request.params.id} not found`,
                ),
              );
          }
          if (result.error.code === "FORBIDDEN") {
            return reply
              .status(403)
              .send(
                createProblemDetail(
                  FORBIDDEN_ERROR_TYPE,
                  "Forbidden",
                  403,
                  "Access denied to the requested proposal",
                ),
              );
          }
          if (
            result.error.code === "PROPOSAL_ALREADY_APPROVED" ||
            result.error.code === "PROPOSAL_ALREADY_REJECTED"
          ) {
            return reply
              .status(409)
              .send(
                createProblemDetail(
                  "https://groundgraph.ai/errors/conflict",
                  "Conflict",
                  409,
                  result.error.message,
                ),
              );
          }
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.post("/v1/improvement/proposals/:id/reject", {
    schema: {
      description: "Reject a proposal",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: RejectProposalRequestSchema,
      response: {
        200: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        409: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { proposalId: string; reason: string };
      }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await rejectProposalUC.execute({
        proposalId: request.params.id,
        tenantId: authContext.tenantId,
        rejectedBy: authContext.principalId ?? "unknown",
        reason: request.body.reason,
      });

      if (!result.ok) {
        if (isImprovementError(result.error)) {
          if (result.error.code === "PROPOSAL_NOT_FOUND") {
            return reply
              .status(404)
              .send(
                createProblemDetail(
                  NOT_FOUND_ERROR_TYPE,
                  "Not Found",
                  404,
                  `Proposal ${request.params.id} not found`,
                ),
              );
          }
          if (result.error.code === "FORBIDDEN") {
            return reply
              .status(403)
              .send(
                createProblemDetail(
                  FORBIDDEN_ERROR_TYPE,
                  "Forbidden",
                  403,
                  "Access denied to the requested proposal",
                ),
              );
          }
          if (
            result.error.code === "PROPOSAL_ALREADY_REJECTED" ||
            result.error.code === "PROPOSAL_ALREADY_APPROVED"
          ) {
            return reply
              .status(409)
              .send(
                createProblemDetail(
                  "https://groundgraph.ai/errors/conflict",
                  "Conflict",
                  409,
                  result.error.message,
                ),
              );
          }
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.post("/v1/improvement/proposals/:id/advance", {
    schema: {
      description: "Advance proposal rollout to next stage",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: AdvanceRolloutRequestSchema,
      response: {
        200: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        409: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { proposalId: string; stage: string; notes?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const { notes } = request.body as { notes?: string };
      const result = await advanceRolloutUC.execute({
        proposalId: request.params.id,
        tenantId: authContext.tenantId,
        stage: request.body.stage as "local" | "evaluation" | "shadow" | "canary" | "production",
        ...(notes !== undefined ? { notes } : {}),
      });

      if (!result.ok) {
        if (isImprovementError(result.error)) {
          if (result.error.code === "PROPOSAL_NOT_FOUND") {
            return reply
              .status(404)
              .send(
                createProblemDetail(
                  NOT_FOUND_ERROR_TYPE,
                  "Not Found",
                  404,
                  `Proposal ${request.params.id} not found`,
                ),
              );
          }
          if (result.error.code === "FORBIDDEN") {
            return reply
              .status(403)
              .send(
                createProblemDetail(
                  FORBIDDEN_ERROR_TYPE,
                  "Forbidden",
                  403,
                  "Access denied to the requested proposal",
                ),
              );
          }
          if (result.error.code === "INVALID_ROLLOUT_TRANSITION") {
            return reply
              .status(409)
              .send(
                createProblemDetail(
                  "https://groundgraph.ai/errors/conflict",
                  "Conflict",
                  409,
                  result.error.message,
                ),
              );
          }
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.post("/v1/improvement/proposals/:id/rollback", {
    schema: {
      description: "Rollback a proposal",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: RollbackProposalRequestSchema,
      response: {
        200: ProposalResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        409: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { proposalId: string; reason: string };
      }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await rollbackProposalUC.execute({
        proposalId: request.params.id,
        tenantId: authContext.tenantId,
        rolledBackBy: authContext.principalId ?? "unknown",
        reason: request.body.reason,
      });

      if (!result.ok) {
        if (isImprovementError(result.error)) {
          if (result.error.code === "PROPOSAL_NOT_FOUND") {
            return reply
              .status(404)
              .send(
                createProblemDetail(
                  NOT_FOUND_ERROR_TYPE,
                  "Not Found",
                  404,
                  `Proposal ${request.params.id} not found`,
                ),
              );
          }
          if (result.error.code === "FORBIDDEN") {
            return reply
              .status(403)
              .send(
                createProblemDetail(
                  FORBIDDEN_ERROR_TYPE,
                  "Forbidden",
                  403,
                  "Access denied to the requested proposal",
                ),
              );
          }
          if (result.error.code === "INVALID_STATE") {
            return reply
              .status(409)
              .send(
                createProblemDetail(
                  "https://groundgraph.ai/errors/conflict",
                  "Conflict",
                  409,
                  result.error.message,
                ),
              );
          }
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply
        .status(200)
        .send(mapProposalToResponse(ProposalResponseSchema.parse(result.value)));
    },
  });

  app.get("/v1/improvement/drift", {
    schema: {
      description: "List drift reports",
      tags: ["improvement"],
      querystring: ListDriftReportsRequestSchema,
      response: {
        200: ListDriftReportsResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: ListDriftReportsRequest }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const query = request.query as ListDriftReportsRequest;
      if (authContext.tenantId !== query.tenantId) {
        return reply
          .status(403)
          .send(
            createProblemDetail(
              FORBIDDEN_ERROR_TYPE,
              "Forbidden",
              403,
              "Access denied to the requested tenant",
            ),
          );
      }

      const driftFilters: DriftFilters = { tenantId: query.tenantId };
      if (query.reviewStatus !== undefined) driftFilters.reviewStatus = query.reviewStatus;
      if (query.severity !== undefined) driftFilters.severity = query.severity;
      if (query.type !== undefined) driftFilters.type = query.type;

      const result = await listDriftReportsUC.execute(driftFilters);
      if (!result.ok) {
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply.status(200).send({
        reports: result.value.map((r) => DriftReportResponseSchema.parse(r)),
        total: result.value.length,
      });
    },
  });

  app.post("/v1/improvement/drift", {
    schema: {
      description: "Create a drift report",
      tags: ["improvement"],
      body: CreateDriftReportRequestSchema,
      response: {
        201: DriftReportResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Body: CreateDriftReportRequest }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const body = request.body as CreateDriftReportRequest;
      const result = await createDriftReportUC.execute({
        type: body.type,
        severity: body.severity,
        description: body.description,
        expectedValue: body.expectedValue,
        actualValue: body.actualValue,
        tenantId: authContext.tenantId,
      });

      if (!result.ok) {
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply.status(201).send(DriftReportResponseSchema.parse(result.value));
    },
  });

  app.post("/v1/improvement/drift/:id/review", {
    schema: {
      description: "Review a drift report",
      tags: ["improvement"],
      params: z.object({ id: z.string().uuid() }),
      body: ReviewDriftReportRequestSchema,
      response: {
        200: DriftReportResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reportId: string; status: "pending" | "in_review" | "resolved" | "accepted_risk" };
      }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      const result = await reviewDriftReportUC.execute(
        request.params.id,
        authContext.tenantId,
        authContext.principalId ?? "unknown",
        request.body.status,
      );

      if (!result.ok) {
        if (isImprovementError(result.error) && result.error.code === "DRIFT_REPORT_NOT_FOUND") {
          return reply
            .status(404)
            .send(
              createProblemDetail(
                NOT_FOUND_ERROR_TYPE,
                "Not Found",
                404,
                `Drift report ${request.params.id} not found`,
              ),
            );
        }
        if (isImprovementError(result.error) && result.error.code === "FORBIDDEN") {
          return reply
            .status(403)
            .send(
              createProblemDetail(
                FORBIDDEN_ERROR_TYPE,
                "Forbidden",
                403,
                "Access denied to the requested drift report",
              ),
            );
        }
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply.status(200).send(DriftReportResponseSchema.parse(result.value));
    },
  });

  app.get("/v1/improvement/metrics", {
    schema: {
      description: "Get improvement metrics",
      tags: ["improvement"],
      querystring: z.object({ tenantId: z.string().uuid() }),
      response: {
        200: ImprovementMetricsResponseSchema,
        400: z.object({}).passthrough(),
        401: z.object({}).passthrough(),
        403: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: { tenantId: string } }>,
      reply: FastifyReply,
    ) => {
      const authContext = request.authContext;
      if (!authContext) {
        return reply
          .status(401)
          .send(
            createProblemDetail(
              UNAUTHORIZED_ERROR_TYPE,
              "Unauthorized",
              401,
              "Authentication required",
            ),
          );
      }

      if (authContext.tenantId !== request.query.tenantId) {
        return reply
          .status(403)
          .send(
            createProblemDetail(
              FORBIDDEN_ERROR_TYPE,
              "Forbidden",
              403,
              "Access denied to the requested tenant",
            ),
          );
      }

      const result = await getMetricsUC.execute(request.query.tenantId);
      if (!result.ok) {
        return reply
          .status(500)
          .send(
            createProblemDetail(
              INTERNAL_ERROR_TYPE,
              "Internal Server Error",
              500,
              result.error.message,
            ),
          );
      }

      return reply.status(200).send(ImprovementMetricsResponseSchema.parse(result.value));
    },
  });
}
