import { z } from "zod";

export const OutboxEventStatusSchema = z.enum(["pending", "claimed", "completed", "dead_letter"]);

export type OutboxEventStatus = z.infer<typeof OutboxEventStatusSchema>;

export const OutboxEventSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  aggregateType: z.string(),
  aggregateId: z.uuid(),
  eventType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  status: OutboxEventStatusSchema,
  attempts: z.number().int().nonnegative().default(0),
  availableAt: z.iso.datetime(),
  claimedAt: z.iso.datetime().optional(),
  claimedBy: z.string().optional(),
  leaseToken: z.string().optional(),
  completedAt: z.iso.datetime().optional(),
  deadLetteredAt: z.iso.datetime().optional(),
  error: z.string().max(500).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
