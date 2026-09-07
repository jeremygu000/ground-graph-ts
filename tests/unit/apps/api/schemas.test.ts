import { describe, expect, it } from "vitest";
import {
  QueryRequestSchema,
  QueryResponseSchema,
} from "../../../../apps/api/src/schemas/query.schema";
import {
  SourceTypeSchema,
  ChunkingStrategySchema,
  IngestRequestSchema,
  IngestResponseSchema,
} from "../../../../apps/api/src/schemas/ingestion.schema";
import { ListDocumentsRequestSchema } from "../../../../apps/api/src/schemas/documents.schema";
import {
  ListEntitiesRequestSchema,
  GetEntityRequestSchema,
} from "../../../../apps/api/src/schemas/entities.schema";
import {
  ProblemDetailSchema,
  createProblemDetail,
  VALIDATION_ERROR_TYPE,
  NOT_FOUND_ERROR_TYPE,
} from "../../../../apps/api/src/schemas/problem-detail.schema";

describe("Query Schemas", () => {
  it("validates query request with default strategy", () => {
    const request = {
      question: "test query",
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
    };
    const result = QueryRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question).toBe("test query");
      expect(result.data.strategy).toBe("hybrid");
    }
  });

  it("validates query request with custom strategy", () => {
    const request = {
      question: "test query",
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
      strategy: "graph",
      maxResults: 50,
    };
    const result = QueryRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.strategy).toBe("graph");
      expect(result.data.maxResults).toBe(50);
    }
  });

  it("rejects invalid strategy", () => {
    const request = {
      question: "test",
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
      strategy: "invalid",
    };
    const result = QueryRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it("validates query response schema", () => {
    const response = {
      queryId: "123",
      answer: "Test answer",
      status: "answered",
      claims: [],
      strategiesUsed: ["hybrid"],
      fusionTrace: [],
      timingMs: {
        entityResolution: 10,
        retrieval: 20,
        generation: 30,
        total: 60,
      },
    };
    const result = QueryResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

describe("SourceTypeSchema", () => {
  it("accepts valid source types", () => {
    expect(SourceTypeSchema.safeParse("file").success).toBe(true);
    expect(SourceTypeSchema.safeParse("url").success).toBe(true);
    expect(SourceTypeSchema.safeParse("git").success).toBe(true);
    expect(SourceTypeSchema.safeParse("api").success).toBe(true);
    expect(SourceTypeSchema.safeParse("s3").success).toBe(true);
  });

  it("rejects invalid source types", () => {
    expect(SourceTypeSchema.safeParse("http").success).toBe(false);
    expect(SourceTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("ChunkingStrategySchema", () => {
  it("accepts valid chunking strategies", () => {
    expect(ChunkingStrategySchema.safeParse("heading").success).toBe(true);
    expect(ChunkingStrategySchema.safeParse("recursive").success).toBe(true);
    expect(ChunkingStrategySchema.safeParse("page").success).toBe(true);
    expect(ChunkingStrategySchema.safeParse("semantic").success).toBe(true);
  });

  it("rejects invalid chunking strategies", () => {
    expect(ChunkingStrategySchema.safeParse("auto").success).toBe(false);
  });
});

describe("IngestRequestSchema", () => {
  it("validates valid ingest request", () => {
    const request = {
      sourceUri: "https://example.com/doc.pdf",
      sourceType: "url",
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
    };
    const result = IngestRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("validates ingest request with all optional fields", () => {
    const request = {
      sourceUri: "s3://bucket/path/file.pdf",
      sourceType: "s3",
      mimeType: "application/pdf",
      metadata: { key: "value" },
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
      chunkingStrategy: "heading",
      maxChunkSize: 1000,
      chunkOverlap: 200,
    };
    const result = IngestRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("rejects invalid tenant ID format", () => {
    const request = {
      sourceUri: "https://example.com/doc.pdf",
      sourceType: "url",
      tenantId: "not-a-uuid",
      principalId: "123e4567-e89b-12d3-a456-426614174001",
    };
    const result = IngestRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

describe("IngestResponseSchema", () => {
  it("validates successful ingest response", () => {
    const response = {
      documentId: "123e4567-e89b-12d3-a456-426614174000",
      versionId: "123e4567-e89b-12d3-a456-426614174001",
      versionNumber: 1,
      status: "created",
      chunksCreated: 10,
      qualityReport: {
        totalChunks: 10,
        avgChunkSize: 500,
        extractionMethods: { structured: 5, llm: 5 },
        entityCount: 20,
        factCount: 30,
      },
    };
    const result = IngestResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });

  it("validates response with trace ID", () => {
    const response = {
      documentId: "123e4567-e89b-12d3-a456-426614174000",
      versionId: "123e4567-e89b-12d3-a456-426614174001",
      versionNumber: 1,
      status: "updated",
      chunksCreated: 5,
      qualityReport: {
        totalChunks: 5,
        avgChunkSize: 300,
        extractionMethods: {},
        entityCount: 10,
        factCount: 15,
      },
      traceId: "abc123",
    };
    const result = IngestResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
  });
});

describe("ProblemDetailSchema", () => {
  it("creates valid problem detail", () => {
    const problem = createProblemDetail(
      VALIDATION_ERROR_TYPE,
      "Validation Error",
      400,
      "Invalid input",
    );
    expect(problem.type).toBe(VALIDATION_ERROR_TYPE);
    expect(problem.title).toBe("Validation Error");
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe("Invalid input");
  });

  it("creates problem detail without optional fields", () => {
    const problem = createProblemDetail(NOT_FOUND_ERROR_TYPE, "Not Found", 404);
    expect(problem.type).toBe(NOT_FOUND_ERROR_TYPE);
    expect(problem.status).toBe(404);
    expect(problem.detail).toBeUndefined();
    expect(problem.instance).toBeUndefined();
  });

  it("creates problem detail with instance", () => {
    const problem = createProblemDetail(
      VALIDATION_ERROR_TYPE,
      "Bad Request",
      400,
      "Invalid field",
      "https://groundgraph.ai/v1/documents/123",
    );
    expect(problem.instance).toBe("https://groundgraph.ai/v1/documents/123");
  });

  it("validates problem detail schema", () => {
    const problem = {
      type: "https://example.com/problem",
      title: "Error",
      status: 500,
      detail: "Something went wrong",
    };
    const result = ProblemDetailSchema.safeParse(problem);
    expect(result.success).toBe(true);
  });

  it("rejects invalid status code", () => {
    const problem = {
      type: "https://example.com/problem",
      title: "Error",
      status: 200,
    };
    const result = ProblemDetailSchema.safeParse(problem);
    expect(result.success).toBe(false);
  });

  it("rejects status code above 599", () => {
    const problem = {
      type: "https://example.com/problem",
      title: "Error",
      status: 600,
    };
    const result = ProblemDetailSchema.safeParse(problem);
    expect(result.success).toBe(false);
  });
});

describe("ListDocumentsRequestSchema", () => {
  it("validates request with defaults", () => {
    const request = {
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
    };
    const result = ListDocumentsRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("validates request with custom pagination", () => {
    const request = {
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      limit: 50,
      offset: 10,
    };
    const result = ListDocumentsRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("rejects limit over 100", () => {
    const request = {
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      limit: 101,
    };
    const result = ListDocumentsRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

describe("ListEntitiesRequestSchema", () => {
  it("validates request with defaults", () => {
    const request = {
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
    };
    const result = ListEntitiesRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it("validates request with entity type filter", () => {
    const request = {
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      entityType: "Person",
    };
    const result = ListEntitiesRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});

describe("GetEntityRequestSchema", () => {
  it("validates valid request", () => {
    const request = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      tenantId: "123e4567-e89b-12d3-a456-426614174001",
    };
    const result = GetEntityRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const request = {
      id: "not-a-uuid",
      tenantId: "123e4567-e89b-12d3-a456-426614174001",
    };
    const result = GetEntityRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});
