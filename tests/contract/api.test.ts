import { describe, expect, it } from "vitest";
import { QueryRequestSchema, QueryResponseSchema } from "../../apps/api/src/schemas/query.schema";
import { ProblemDetailSchema } from "../../apps/api/src/schemas/problem-detail.schema";
import {
  ListDocumentsResponseSchema,
  GetDocumentResponseSchema,
} from "../../apps/api/src/schemas/documents.schema";
import {
  ListEntitiesResponseSchema,
  GetEntityResponseSchema,
} from "../../apps/api/src/schemas/entities.schema";

describe("API contract tests", () => {
  describe("Query schemas", () => {
    it("QueryRequestSchema accepts valid request", () => {
      const validRequest = {
        question: "What services depend on component X?",
        strategy: "hybrid",
        maxResults: 10,
        tenantId: crypto.randomUUID(),
        principalId: crypto.randomUUID(),
      };
      const result = QueryRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it("QueryRequestSchema rejects missing question", () => {
      const invalidRequest = {
        strategy: "hybrid",
      };
      const result = QueryRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it("QueryRequestSchema accepts all strategy values", () => {
      for (const strategy of ["vector", "graph", "hybrid", "fulltext"]) {
        const request = {
          question: "test?",
          strategy,
          tenantId: crypto.randomUUID(),
          principalId: crypto.randomUUID(),
        };
        const result = QueryRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it("QueryResponseSchema accepts valid response", () => {
      const validResponse = {
        queryId: crypto.randomUUID(),
        answer: "Based on evidence: some content",
        status: "answered",
        claims: [],
        strategiesUsed: ["hybrid"],
        fusionTrace: [{ strategy: "hybrid", inputs: 1, fused: 1, weight: 1 }],
        timingMs: {
          entityResolution: 10,
          retrieval: 50,
          generation: 100,
          total: 160,
        },
      };
      const result = QueryResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it("QueryResponseSchema accepts insufficient_evidence status", () => {
      const response = {
        queryId: crypto.randomUUID(),
        answer: "",
        status: "insufficient_evidence",
        claims: [],
        strategiesUsed: ["vector"],
        fusionTrace: [{ strategy: "vector", inputs: 1, fused: 1, weight: 1 }],
        timingMs: {
          entityResolution: 5,
          retrieval: 20,
          generation: 0,
          total: 25,
        },
      };
      const result = QueryResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe("Problem detail schema", () => {
    it("ProblemDetailSchema accepts valid RFC 7807 problem detail", () => {
      const problem = {
        type: "https://groundgraph.ai/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing or invalid Authorization header",
      };
      const result = ProblemDetailSchema.safeParse(problem);
      expect(result.success).toBe(true);
    });

    it("ProblemDetailSchema rejects missing required fields", () => {
      const invalid = {
        type: "about:blank",
      };
      const result = ProblemDetailSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("ProblemDetailSchema accepts RFC 7807 fields", () => {
      const problem = {
        type: "https://groundgraph.ai/errors/internal",
        title: "Internal Server Error",
        status: 500,
        detail: "Something went wrong",
        instance: "https://groundgraph.ai/v1/query",
        extensions: { retryable: false },
      };
      const result = ProblemDetailSchema.safeParse(problem);
      expect(result.success).toBe(true);
    });
  });

  describe("Document schemas", () => {
    it("GetDocumentResponseSchema accepts valid document", () => {
      const doc = {
        id: crypto.randomUUID(),
        sourceId: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        title: "Test Document",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documentType: "file",
        isActive: true,
      };
      const result = GetDocumentResponseSchema.safeParse(doc);
      expect(result.success).toBe(true);
    });

    it("ListDocumentsResponseSchema accepts valid list", () => {
      const list = {
        documents: [],
        total: 0,
        limit: 20,
        offset: 0,
      };
      const result = ListDocumentsResponseSchema.safeParse(list);
      expect(result.success).toBe(true);
    });
  });

  describe("Entity schemas", () => {
    it("GetEntityResponseSchema accepts valid entity", () => {
      const entity = {
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        canonicalName: "TestEntity",
        entityType: "Service",
        aliases: [],
        attributes: {},
        description: null,
        createdAt: new Date().toISOString(),
        validFrom: new Date().toISOString(),
        validTo: null,
        supersededBy: null,
        createdBy: null,
      };
      const result = GetEntityResponseSchema.safeParse(entity);
      expect(result.success).toBe(true);
    });

    it("ListEntitiesResponseSchema accepts valid list", () => {
      const list = {
        entities: [],
        total: 0,
        limit: 20,
        offset: 0,
      };
      const result = ListEntitiesResponseSchema.safeParse(list);
      expect(result.success).toBe(true);
    });
  });
});
