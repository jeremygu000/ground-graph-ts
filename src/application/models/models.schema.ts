import { z } from "zod";
import type { StructuredAnswer } from "./models.types";

export const StructuredAnswerSchema: z.ZodType<StructuredAnswer> = z.object({
  answer: z.string(),
  status: z.enum(["answered", "insufficient_evidence", "refused"]),
  claims: z.array(
    z.object({
      claimId: z.string().uuid(),
      claimText: z.string(),
      citations: z.array(
        z.object({
          citationId: z.string().uuid(),
          evidenceId: z.string().uuid(),
          chunkId: z.string().uuid(),
          documentVersionId: z.string().uuid(),
          locatorPath: z.string(),
          snippet: z.string(),
          startChar: z.number().int().nonnegative(),
          endChar: z.number().int().nonnegative(),
          score: z.number().min(0).max(1),
        }),
      ),
      confidence: z.number().min(0).max(1),
      supportedBy: z.array(z.string()),
    }),
  ),
  refusalReason: z.string().optional(),
}) as unknown as z.ZodType<StructuredAnswer>;
