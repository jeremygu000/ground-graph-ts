import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ListEntitiesRequestSchema,
  ListEntitiesResponseSchema,
  GetEntityRequestSchema,
  GetEntityResponseSchema,
  type ListEntitiesRequest,
  type GetEntityRequest,
} from "../schemas/entities.schema";
import type { UnitOfWorkFactory } from "../../../../src/application/unit-of-work.types";
import {
  createProblemDetail,
  NOT_FOUND_ERROR_TYPE,
  INTERNAL_ERROR_TYPE,
} from "../schemas/problem-detail.schema";

export interface EntitiesRouteDeps {
  uowFactory: UnitOfWorkFactory;
}

export async function registerEntitiesRoutes(
  app: FastifyInstance,
  deps: EntitiesRouteDeps,
): Promise<void> {
  app.get("/v1/entities", {
    schema: {
      description: "List entities for a tenant",
      tags: ["entities"],
      querystring: ListEntitiesRequestSchema,
      response: {
        200: ListEntitiesResponseSchema,
        400: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: ListEntitiesRequest }>,
      reply: FastifyReply,
    ) => {
      const { uowFactory } = deps;
      const query = request.query as ListEntitiesRequest;

      try {
        const uow = await uowFactory.create();
        const result = await uow.entityRepository.list(query.tenantId, query.limit, query.offset);

        if (!result.ok) {
          return reply
            .status(500)
            .send(
              createProblemDetail(
                INTERNAL_ERROR_TYPE,
                "Internal Server Error",
                500,
                "Failed to list entities",
              ),
            );
        }

        let entities = result.value;

        if (query.entityType) {
          entities = entities.filter((e) => e.entityType === query.entityType);
        }

        return reply.status(200).send({
          entities: entities.map((entity) => ({
            id: entity.id,
            tenantId: entity.tenantId,
            canonicalName: entity.canonicalName,
            entityType: entity.entityType,
            aliases: entity.aliases,
            description: entity.description ?? null,
            createdAt: entity.createdAt,
            validFrom: entity.validFrom,
            validTo: entity.validTo ?? null,
            supersededBy: entity.supersededBy ?? null,
          })),
          total: entities.length,
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

  app.get("/v1/entities/:id", {
    schema: {
      description: "Get an entity by ID",
      tags: ["entities"],
      params: z.object({
        id: z.string().uuid(),
      }),
      querystring: GetEntityRequestSchema,
      response: {
        200: GetEntityResponseSchema,
        400: z.object({}).passthrough(),
        404: z.object({}).passthrough(),
        500: z.object({}).passthrough(),
      },
    },
    handler: async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: GetEntityRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const { uowFactory } = deps;
      const { id } = request.params;
      const { tenantId } = request.query as GetEntityRequest;

      try {
        const uow = await uowFactory.create();
        const entityResult = await uow.entityRepository.findById(id, tenantId);

        if (!entityResult.ok) {
          return reply
            .status(500)
            .send(
              createProblemDetail(
                INTERNAL_ERROR_TYPE,
                "Internal Server Error",
                500,
                "Failed to get entity",
              ),
            );
        }

        const entity = entityResult.value;
        if (!entity) {
          return reply
            .status(404)
            .send(
              createProblemDetail(NOT_FOUND_ERROR_TYPE, "Not Found", 404, `Entity ${id} not found`),
            );
        }

        return reply.status(200).send({
          id: entity.id,
          tenantId: entity.tenantId,
          canonicalName: entity.canonicalName,
          entityType: entity.entityType,
          aliases: entity.aliases,
          attributes: entity.attributes,
          description: entity.description ?? null,
          createdAt: entity.createdAt,
          validFrom: entity.validFrom,
          validTo: entity.validTo ?? null,
          supersededBy: entity.supersededBy ?? null,
          createdBy: entity.createdBy ?? null,
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
