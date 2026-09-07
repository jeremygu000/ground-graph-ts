import { z } from "zod";

export const ReviewStatusSchema = z.enum(["pending", "approved", "rejected", "superseded"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ReviewItemTypeSchema = z.enum(["entity", "fact", "mention", "extraction"]);
export type ReviewItemType = z.infer<typeof ReviewItemTypeSchema>;

export const ReviewQueueItemSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  itemType: ReviewItemTypeSchema,
  itemId: z.uuid(),
  status: ReviewStatusSchema.default("pending"),
  priority: z.number().int().min(0).max(10).default(5),
  assignedTo: z.uuid().optional(),
  reviewNotes: z.string().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().optional(),
  resolvedBy: z.uuid().optional(),
});

export type ReviewQueueItem = z.infer<typeof ReviewQueueItemSchema>;

export const GraphMetricsSchema = z.object({
  tenantId: z.uuid(),
  timestamp: z.iso.datetime(),
  totalEntities: z.number().int().nonnegative(),
  totalFacts: z.number().int().nonnegative(),
  verifiedFacts: z.number().int().nonnegative(),
  candidateFacts: z.number().int().nonnegative(),
  pendingReviews: z.number().int().nonnegative(),
  entityTypes: z.record(z.string(), z.number().int()),
  predicateCounts: z.record(z.string(), z.number().int()),
  avgConfidence: z.number().min(0).max(1).optional(),
});

export type GraphMetrics = z.infer<typeof GraphMetricsSchema>;
