import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ListDocumentsRequestSchema,
  ListDocumentsResponseSchema,
  GetDocumentResponseSchema,
  type ListDocumentsRequest,
  type GetDocumentRequest,
} from "../schemas/documents.schema";
import type { UnitOfWorkFactory } from "../../../../src/application/unit-of-work.types";
import {
  createProblemDetail,
  NOT_FOUND_ERROR_TYPE,
  INTERNAL_ERROR_TYPE,
} from "../schemas/problem-detail.schema";

export interface DocumentsRouteDeps {
  uowFactory: UnitOfWorkFactory;
}

export async function registerDocumentsRoutes(
  app: FastifyInstance,
  deps: DocumentsRouteDeps,
): Promise<void> {
  app.get("/v1/documents", {
    schema: {
      description: "List documents for a tenant",
      tags: ["documents"],
      querystring: ListDocumentsRequestSchema,
      response: {
        200: ListDocumentsResponseSchema,
        400: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: ListDocumentsRequest }>,
      reply: FastifyReply,
    ) => {
      const { uowFactory } = deps;
      const query = request.query as ListDocumentsRequest;

      try {
        const uow = await uowFactory.create();
        const result = await uow.documentRepository.list(query.tenantId, query.limit, query.offset);

        if (!result.ok) {
          return reply
            .status(500)
            .send(
              createProblemDetail(
                INTERNAL_ERROR_TYPE,
                "Internal Server Error",
                500,
                "Failed to list documents",
              ),
            );
        }

        const documents = result.value;

        return reply.status(200).send({
          documents: documents.map((doc) => ({
            id: doc.id,
            tenantId: doc.tenantId,
            sourceId: doc.sourceId,
            title: doc.title ?? null,
            documentType: doc.metadata?.sourceType ?? "file",
            isActive: doc.isActive,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
          total: documents.length,
          limit: query.limit,
          offset: query.offset ?? 0,
        });
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

  app.get("/v1/documents/:id", {
    schema: {
      description: "Get a document by ID",
      tags: ["documents"],
      params: z.object({
        id: z.string().uuid(),
      }),
      querystring: z.object({
        tenantId: z.string().uuid(),
        includeVersions: z.boolean().optional().default(false),
      }),
      response: {
        200: GetDocumentResponseSchema,
        400: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: GetDocumentRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const { uowFactory } = deps;
      const { id } = request.params;
      const { tenantId, includeVersions } = request.query as GetDocumentRequest;

      try {
        const uow = await uowFactory.create();
        const docResult = await uow.documentRepository.findById(id, tenantId);

        if (!docResult.ok) {
          return reply
            .status(500)
            .send(
              createProblemDetail(
                INTERNAL_ERROR_TYPE,
                "Internal Server Error",
                500,
                "Failed to get document",
              ),
            );
        }

        const doc = docResult.value;
        if (!doc) {
          return reply
            .status(404)
            .send(
              createProblemDetail(
                NOT_FOUND_ERROR_TYPE,
                "Not Found",
                404,
                `Document ${id} not found`,
              ),
            );
        }

        let versions = undefined;
        if (includeVersions) {
          const versionsResult = await uow.documentVersionRepository.listByDocument(id, tenantId);
          if (versionsResult.ok) {
            versions = versionsResult.value.map((v) => ({
              id: v.id,
              documentId: v.documentId,
              versionNumber: v.versionNumber,
              contentHash: v.contentHash,
              checksum: v.checksum,
              sizeBytes: v.sizeBytes,
              isActive: v.isActive,
              createdAt: v.createdAt,
              createdBy: v.createdBy ?? null,
            }));
          }
        }

        return reply.status(200).send({
          id: doc.id,
          tenantId: doc.tenantId,
          sourceId: doc.sourceId,
          title: doc.title ?? null,
          documentType: doc.metadata?.sourceType ?? "file",
          isActive: doc.isActive,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          versions,
        });
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
