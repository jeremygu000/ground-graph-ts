import { z } from "zod";

export const OutboxEventStatusSchema = z.enum(["pending", "claimed", "completed", "dead_letter"]);

export type OutboxEventStatus = z.infer<typeof OutboxEventStatusSchema>;

export const OutboxEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  aggregateType: z.string(),
  aggregateId: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
  status: OutboxEventStatusSchema,
  attempts: z.number().int().nonnegative().default(0),
  availableAt: z.string().datetime(),
  claimedAt: z.string().datetime().optional(),
  claimedBy: z.string().optional(),
  leaseToken: z.string().optional(),
  completedAt: z.string().datetime().optional(),
  deadLetteredAt: z.string().datetime().optional(),
  error: z.string().max(500).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
