import { describe, expect, it } from "vitest";
import {
  QueryRequestSchema,
  QueryResponseSchema,
  QueryErrorSchema,
  QueryStrategySchema,
} from "../../../apps/api/src/schemas/query.schema";
import {
  ProblemDetailSchema,
  createProblemDetail,
  VALIDATION_ERROR_TYPE,
  UNAUTHORIZED_ERROR_TYPE,
} from "../../../apps/api/src/schemas/problem-detail.schema";

describe("QueryRequestSchema", () => {
  it("parses a valid query request", () => {
    const valid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
    };
    const result = QueryRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("parses optional filters and budgets", () => {
    const valid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
      filters: {
        documentIds: ["550e8400-e29b-41d4-a716-446655440002"],
        entityTypes: ["Person", "Location"],
        factStatuses: ["verified"],
        timeRange: {
          validFrom: "2024-01-01T00:00:00.000Z",
          validTo: "2024-12-31T23:59:59.999Z",
        },
      },
      budgets: {
        vectorResults: 10,
        graphResults: 5,
        fusionRatio: 0.5,
      },
      maxResults: 20,
      maxHops: 3,
    };
    const result = QueryRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const invalid = { question: "What?" };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for tenantId", () => {
    const invalid = {
      question: "What is the capital of France?",
      tenantId: "not-a-uuid",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid strategy", () => {
    const invalid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "invalid",
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects question that is too long", () => {
    const invalid = {
      question: "x".repeat(10001),
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid fact statuses", () => {
    const invalid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
      filters: {
        factStatuses: ["invalid_status"],
      },
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects maxResults over 100", () => {
    const invalid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
      maxResults: 101,
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative fusionRatio", () => {
    const invalid = {
      question: "What is the capital of France?",
      tenantId: "550e8400-e29b-41d4-a716-446655440000",
      principalId: "550e8400-e29b-41d4-a716-446655440001",
      strategy: "hybrid",
      budgets: {
        fusionRatio: -0.1,
      },
    };
    const result = QueryRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("QueryResponseSchema", () => {
  it("parses a valid response", () => {
    const valid = {
      queryId: "550e8400-e29b-41d4-a716-446655440099",
      answer: "Paris is the capital of France.",
      status: "answered",
      claims: [
        {
          claimId: "claim-1",
          claimText: "Paris is the capital of France.",
          citations: [{ evidenceId: "ev-1", snippet: "Paris is the capital..." }],
          confidence: 0.95,
        },
      ],
      strategiesUsed: ["vector", "graph"],
      fusionTrace: [
        { strategy: "vector", inputs: 10, fused: 8, weight: 0.6 },
        { strategy: "graph", inputs: 5, fused: 4, weight: 0.4 },
      ],
      timingMs: {
        entityResolution: 10,
        retrieval: 100,
        generation: 200,
        total: 310,
      },
    };
    const result = QueryResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const invalid = {
      queryId: "550e8400-e29b-41d4-a716-446655440099",
      answer: "Paris",
      status: "invalid_status",
      claims: [],
      strategiesUsed: [],
      fusionTrace: [],
      timingMs: { entityResolution: 0, retrieval: 0, generation: 0, total: 0 },
    };
    const result = QueryResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects confidence out of range", () => {
    const invalid = {
      queryId: "550e8400-e29b-41d4-a716-446655440099",
      answer: "Paris",
      status: "answered",
      claims: [
        {
          claimId: "claim-1",
          claimText: "Paris is the capital of France.",
          citations: [],
          confidence: 1.5,
        },
      ],
      strategiesUsed: [],
      fusionTrace: [],
      timingMs: { entityResolution: 0, retrieval: 0, generation: 0, total: 0 },
    };
    const result = QueryResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("QueryErrorSchema", () => {
  it("parses a valid RFC 7807 problem detail error", () => {
    const valid = {
      type: "https://groundgraph.ai/errors/validation",
      title: "Validation Error",
      status: 400,
      detail: "Invalid request body",
    };
    const result = QueryErrorSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status code", () => {
    const invalid = {
      type: "https://groundgraph.ai/errors/validation",
      title: "Validation Error",
      status: 200,
    };
    const result = QueryErrorSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("QueryStrategySchema", () => {
  it("accepts all valid strategies", () => {
    for (const s of ["vector", "graph", "hybrid", "fulltext"]) {
      expect(QueryStrategySchema.safeParse(s).success).toBe(true);
    }
  });

  it("rejects invalid strategy", () => {
    expect(QueryStrategySchema.safeParse("invalid").success).toBe(false);
  });
});

describe("ProblemDetailSchema", () => {
  it("parses a valid problem detail", () => {
    const valid = {
      type: "https://groundgraph.ai/errors/validation",
      title: "Bad Request",
      status: 400,
      detail: "The request body is invalid",
      instance: "https://groundgraph.ai/api/v1/query",
    };
    const result = ProblemDetailSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects status out of range", () => {
    const invalid = {
      type: "https://groundgraph.ai/errors/validation",
      title: "Bad Request",
      status: 200,
    };
    const result = ProblemDetailSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("createProblemDetail", () => {
  it("creates a valid problem detail", () => {
    const problem = createProblemDetail(
      VALIDATION_ERROR_TYPE,
      "Validation Error",
      400,
      "Field 'question' is required",
    );
    expect(problem.type).toBe(VALIDATION_ERROR_TYPE);
    expect(problem.title).toBe("Validation Error");
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe("Field 'question' is required");
  });

  it("creates problem detail with instance", () => {
    const problem = createProblemDetail(
      UNAUTHORIZED_ERROR_TYPE,
      "Unauthorized",
      401,
      "Access denied",
      "https://groundgraph.ai/api/v1/query",
    );
    expect(problem.instance).toBe("https://groundgraph.ai/api/v1/query");
  });
});
