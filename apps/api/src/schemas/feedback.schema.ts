import { z } from "zod";

export const FeedbackRatingSchema = z.enum(["helpful", "not_helpful", "correct", "incorrect"]);
export type FeedbackRating = z.infer<typeof FeedbackRatingSchema>;

export const FeedbackTargetSchema = z.enum(["query", "claim", "citation", "answer"]);
export type FeedbackTarget = z.infer<typeof FeedbackTargetSchema>;

export const FeedbackSubmissionSchema = z.object({
  queryId: z.string().uuid(),
  target: FeedbackTargetSchema,
  targetId: z.string().optional(),
  rating: FeedbackRatingSchema,
  comment: z.string().max(2000).optional(),
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
});

export type FeedbackSubmission = z.infer<typeof FeedbackSubmissionSchema>;

export const FeedbackResponseSchema = z.object({
  feedbackId: z.string().uuid(),
  queryId: z.string().uuid(),
  target: FeedbackTargetSchema,
  rating: FeedbackRatingSchema,
  comment: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});

export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>;

export const EvaluationComparisonSchema = z.object({
  queryId: z.string().uuid(),
  evaluationId: z.string().uuid().optional(),
  groundTruthAnswer: z.string().optional(),
  modelAnswer: z.string(),
  citations: z.array(z.string()).optional(),
  feedback: FeedbackRatingSchema.optional(),
  correct: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export type EvaluationComparison = z.infer<typeof EvaluationComparisonSchema>;
