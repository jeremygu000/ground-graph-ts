import { describe, expect, it, vi } from "vitest";
import type { HybridQueryPort } from "../../../src/application/retrieval/ports.types";
import type {
  CitationBuilderPort,
  CitationOutput,
  GeneratorPort,
} from "../../../src/application/models/models.types";
import type { TracerPort } from "../../../src/application/observability/tracer-port.types";
import { RetrievalService } from "../../../src/application/retrieval/retrieval-service";
import type { RetrievalWorkflowInput } from "../../../src/application/retrieval/workflow.types";

function createMockTracer(): TracerPort {
  return {
    startActiveSpan: async <T>(_name: string, fn: (span: any) => Promise<T>) => {
      const span = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
        addEvent: vi.fn(),
      };
      return fn(span);
    },
    startSpan: (_name: string) => ({
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
      addEvent: vi.fn(),
    }),
  };
}

function createMockCitationOutput(): CitationOutput {
  return {
    citationId: "cite-1",
    evidenceId: "ev-1",
    chunkId: "chunk-1",
    documentVersionId: "docver-1",
    locatorPath: "file:///doc.md",
    snippet: "Test snippet",
    startChar: 0,
    endChar: 12,
    score: 0.95,
  };
}

function createValidInput(): RetrievalWorkflowInput {
  return {
    question: "What is TypeScript?",
    tenantId: "22222222-2222-4222-8222-222222222222",
    principalId: "33333333-3333-4333-8333-333333333333",
    strategy: "hybrid",
  };
}

describe("RetrievalService", () => {
  describe("execute", () => {
    it("returns successful result with answered status", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [],
            timing: {
              entityResolutionMs: 10,
              embeddingMs: 20,
              vectorSearchMs: 30,
              fullTextSearchMs: 40,
              graphSearchMs: 50,
              fusionMs: 60,
              rerankMs: 70,
              totalMs: 100,
            },
          },
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            structured: {
              answer: "TypeScript is a typed superset of JavaScript.",
              status: "answered" as const,
              claims: [
                {
                  claimId: "claim-1",
                  claimText: "TypeScript is a typed superset of JavaScript.",
                  citations: [createMockCitationOutput()],
                  confidence: 0.9,
                },
              ],
            },
            model: "test-model",
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            finishReason: "stop" as const,
            repairAttempts: 0,
          },
        }),
        getModel: vi.fn().mockReturnValue("test-model"),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      const result = await service.execute(createValidInput());

      expect(result.status).toBe("answered");
      expect(result.answer).toBe("TypeScript is a typed superset of JavaScript.");
      expect(result.claims).toHaveLength(1);
      expect(result.queryId).toBe("q-1");
    });

    it("throws when hybrid query fails", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Query failed"),
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn(),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi.fn(),
        getModel: vi.fn(),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      await expect(service.execute(createValidInput())).rejects.toThrow("Query failed");
    });

    it("throws when citation building fails", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [],
            timing: {
              entityResolutionMs: 10,
              embeddingMs: 20,
              vectorSearchMs: 30,
              fullTextSearchMs: 40,
              graphSearchMs: 50,
              fusionMs: 60,
              rerankMs: 70,
              totalMs: 100,
            },
          },
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Citation build failed"),
        }),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi.fn(),
        getModel: vi.fn(),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      await expect(service.execute(createValidInput())).rejects.toThrow("Citation build failed");
    });

    it("throws when generation fails", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [],
            timing: {
              entityResolutionMs: 10,
              embeddingMs: 20,
              vectorSearchMs: 30,
              fullTextSearchMs: 40,
              graphSearchMs: 50,
              fusionMs: 60,
              rerankMs: 70,
              totalMs: 100,
            },
          },
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Generation failed"),
        }),
        getModel: vi.fn(),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      await expect(service.execute(createValidInput())).rejects.toThrow("Generation failed");
    });

    it("retries with expanded results on insufficient evidence", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [],
            timing: {
              entityResolutionMs: 10,
              embeddingMs: 20,
              vectorSearchMs: 30,
              fullTextSearchMs: 40,
              graphSearchMs: 50,
              fusionMs: 60,
              rerankMs: 70,
              totalMs: 100,
            },
          },
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            value: {
              structured: {
                answer: "",
                status: "insufficient_evidence" as const,
                claims: [],
              },
              model: "test-model",
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
              finishReason: "stop" as const,
              repairAttempts: 0,
            },
          })
          .mockResolvedValueOnce({
            ok: true,
            value: {
              structured: {
                answer: "TypeScript is a typed superset of JavaScript.",
                status: "answered" as const,
                claims: [
                  {
                    claimId: "claim-1",
                    claimText: "TypeScript is a typed superset of JavaScript.",
                    citations: [createMockCitationOutput()],
                    confidence: 0.9,
                  },
                ],
              },
              model: "test-model",
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150,
              finishReason: "stop" as const,
              repairAttempts: 1,
            },
          }),
        getModel: vi.fn(),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      const result = await service.execute(createValidInput());

      expect(result.status).toBe("answered");
      expect(hybridQuery.query).toHaveBeenCalledTimes(2);
    });

    it("includes traceId in result when provided in input", async () => {
      const hybridQuery: HybridQueryPort = {
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [],
            timing: {
              entityResolutionMs: 10,
              embeddingMs: 20,
              vectorSearchMs: 30,
              fullTextSearchMs: 40,
              graphSearchMs: 50,
              fusionMs: 60,
              rerankMs: 70,
              totalMs: 100,
            },
          },
        }),
      };
      const citationBuilder: CitationBuilderPort = {
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
        buildEvidenceReferences: vi.fn().mockReturnValue([]),
      };
      const generator: GeneratorPort = {
        generateStructured: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            structured: {
              answer: "TypeScript is a typed superset of JavaScript.",
              status: "answered" as const,
              claims: [
                {
                  claimId: "claim-1",
                  claimText: "TypeScript is a typed superset of JavaScript.",
                  citations: [createMockCitationOutput()],
                  confidence: 0.9,
                },
              ],
            },
            model: "test-model",
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            finishReason: "stop" as const,
            repairAttempts: 0,
          },
        }),
        getModel: vi.fn(),
      };

      const service = new RetrievalService(
        hybridQuery,
        citationBuilder,
        generator,
        createMockTracer(),
      );

      const input = createValidInput();
      input.traceId = "trace-123";
      const result = await service.execute(input);

      expect(result.traceId).toBe("trace-123");
    });
  });
});
