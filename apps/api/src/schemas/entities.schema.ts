import { z } from "zod";

export const EntitySummarySchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  canonicalName: z.string(),
  entityType: z.string(),
  aliases: z.array(z.string()),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  validFrom: z.iso.datetime(),
  validTo: z.iso.datetime().nullable(),
  supersededBy: z.uuid().nullable(),
});

export const ListEntitiesRequestSchema = z.object({
  tenantId: z.uuid(),
  entityType: z.string().optional(),
  limit: z.number().int().positive().max(100).optional().default(20),
  offset: z.number().int().nonnegative().optional().default(0),
});

export const ListEntitiesResponseSchema = z.object({
  entities: z.array(EntitySummarySchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export const GetEntityRequestSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
});

export const GetEntityResponseSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  canonicalName: z.string(),
  entityType: z.string(),
  aliases: z.array(z.string()),
  attributes: z.record(z.string(), z.unknown()),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  validFrom: z.iso.datetime(),
  validTo: z.iso.datetime().nullable(),
  supersededBy: z.uuid().nullable(),
  createdBy: z.string().nullable(),
});

export type EntitySummary = z.infer<typeof EntitySummarySchema>;
export type ListEntitiesRequest = z.infer<typeof ListEntitiesRequestSchema>;
export type ListEntitiesResponse = z.infer<typeof ListEntitiesResponseSchema>;
export type GetEntityRequest = z.infer<typeof GetEntityRequestSchema>;
export type GetEntityResponse = z.infer<typeof GetEntityResponseSchema>;
