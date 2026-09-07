import { z } from "zod";

export const ProblemDetailSchema = z.object({
  type: z.string().url().describe("URI reference that identifies the problem type"),
  title: z.string().describe("Short human-readable summary of the problem"),
  status: z.number().int().min(400).max(599).describe("HTTP status code"),
  detail: z.string().optional().describe("Human-readable explanation specific to this occurrence"),
  instance: z.string().url().optional().describe("URI that identifies the specific occurrence"),
});

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

export function createProblemDetail(
  type: string,
  title: string,
  status: number,
  detail?: string,
  instance?: string,
): ProblemDetail {
  return ProblemDetailSchema.parse({
    type,
    title,
    status,
    detail,
    instance,
  });
}

export const ErrorCodeSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const VALIDATION_ERROR_TYPE = "https://groundgraph.ai/errors/validation";
export const UNAUTHORIZED_ERROR_TYPE = "https://groundgraph.ai/errors/unauthorized";
export const FORBIDDEN_ERROR_TYPE = "https://groundgraph.ai/errors/forbidden";
export const NOT_FOUND_ERROR_TYPE = "https://groundgraph.ai/errors/not-found";
export const CONFLICT_ERROR_TYPE = "https://groundgraph.ai/errors/conflict";
export const INTERNAL_ERROR_TYPE = "https://groundgraph.ai/errors/internal";
export const INSUFFICIENT_EVIDENCE_ERROR_TYPE =
  "https://groundgraph.ai/errors/insufficient-evidence";
export const REFUSED_ERROR_TYPE = "https://groundgraph.ai/errors/refused";
export const CLARIFICATION_NEEDED_ERROR_TYPE = "https://groundgraph.ai/errors/clarification-needed";
