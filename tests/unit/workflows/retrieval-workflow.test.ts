import { describe, expect, it, vi } from "vitest";
import type { HybridQueryPort } from "../../../src/application/retrieval/ports.types";
import type {
  CitationBuilderPort,
  CitationOutput,
  GeneratorPort,
} from "../../../src/application/models/models.types";
import type { TracerPort } from "../../../src/application/observability/tracer-port.types";
import { RetrievalWorkflow } from "../../../src/workflows/retrieval/retrieval-workflow";
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

function createMockHybridQuery(overrides?: Partial<HybridQueryPort>): HybridQueryPort {
  return {
    query: vi.fn(),
    ...overrides,
  };
}

function createMockCitationBuilder(overrides?: Partial<CitationBuilderPort>): CitationBuilderPort {
  return {
    buildFromRetrieval: vi.fn(),
    buildEvidenceReferences: vi.fn(),
    ...overrides,
  };
}

function createMockGenerator(overrides?: Partial<GeneratorPort>): GeneratorPort {
  return {
    generateStructured: vi.fn(),
    getModel: vi.fn().mockReturnValue("test-model"),
    ...overrides,
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
    tenantId: "tenant-1",
    principalId: "principal-1",
    strategy: "hybrid",
  };
}

describe("RetrievalWorkflow", () => {
  describe("execute", () => {
    it("returns successful result with answered status", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
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
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const result = await workflow.execute(createValidInput());

      expect(result.status).toBe("answered");
      expect(result.answer).toBe("TypeScript is a typed superset of JavaScript.");
      expect(result.claims).toHaveLength(1);
      expect(result.queryId).toBe("q-1");
      expect(result.strategiesUsed).toContain("hybrid");
    });

    it("throws when hybrid query fails", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
        query: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Query failed"),
        }),
      });
      const citationBuilder = createMockCitationBuilder();
      const generator = createMockGenerator();

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      await expect(workflow.execute(createValidInput())).rejects.toThrow("Query failed");
    });

    it("throws when citation building fails", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Citation build failed"),
        }),
      });
      const generator = createMockGenerator();

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      await expect(workflow.execute(createValidInput())).rejects.toThrow("Citation build failed");
    });

    it("throws when generation fails", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
        generateStructured: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("Generation failed"),
        }),
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      await expect(workflow.execute(createValidInput())).rejects.toThrow("Generation failed");
    });

    it("retries with expanded results on insufficient evidence", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
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
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const result = await workflow.execute(createValidInput());

      expect(result.status).toBe("answered");
      expect(hybridQuery.query).toHaveBeenCalledTimes(2);
      expect(generator.generateStructured).toHaveBeenCalledTimes(2);
    });

    it("throws when retry generation fails", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
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
            ok: false,
            error: new Error("Generation retry failed"),
          }),
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      await expect(workflow.execute(createValidInput())).rejects.toThrow("Generation retry failed");
    });

    it("returns insufficient_evidence status when retry citation build fails", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi
          .fn()
          .mockResolvedValueOnce({
            ok: true,
            value: [createMockCitationOutput()],
          })
          .mockResolvedValueOnce({
            ok: false,
            error: new Error("Citation retry failed"),
          }),
      });
      const generator = createMockGenerator({
        generateStructured: vi.fn().mockResolvedValue({
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
        }),
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const result = await workflow.execute(createValidInput());
      expect(result.status).toBe("insufficient_evidence");
      expect(hybridQuery.query).toHaveBeenCalledTimes(2);
    });

    it("includes traceId in result when provided in input", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
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
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const input = createValidInput();
      input.traceId = "trace-123";
      const result = await workflow.execute(input);

      expect(result.traceId).toBe("trace-123");
    });

    it("maps fusion trace correctly in result", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
        query: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            queryId: "q-1",
            strategy: "hybrid" as const,
            results: [],
            fusionTrace: [
              { strategy: "vector", inputs: 10, fused: 8, weight: 0.5 },
              { strategy: "graph", inputs: 5, fused: 4, weight: 0.5 },
            ],
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
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
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const result = await workflow.execute(createValidInput());

      expect(result.fusionTrace).toHaveLength(2);
      expect(result.fusionTrace[0]).toEqual({
        strategy: "vector",
        inputs: 10,
        fused: 8,
        weight: 0.5,
      });
    });

    it("includes timing metrics in result", async () => {
      const tracer = createMockTracer();
      const hybridQuery = createMockHybridQuery({
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
            indexVersion: "v1",
          },
        }),
      });
      const citationBuilder = createMockCitationBuilder({
        buildFromRetrieval: vi.fn().mockResolvedValue({
          ok: true,
          value: [createMockCitationOutput()],
        }),
      });
      const generator = createMockGenerator({
        generateStructured: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            structured: {
              answer: "Test answer",
              status: "answered" as const,
              claims: [],
            },
            model: "test-model",
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            finishReason: "stop" as const,
            repairAttempts: 0,
          },
        }),
      });

      const workflow = new RetrievalWorkflow(hybridQuery, citationBuilder, generator, tracer);

      const result = await workflow.execute(createValidInput());

      expect(result.timingMs).toBeDefined();
      expect(result.timingMs.entityResolution).toBeGreaterThanOrEqual(0);
      expect(result.timingMs.retrieval).toBeGreaterThanOrEqual(0);
      expect(result.timingMs.generation).toBeGreaterThanOrEqual(0);
      expect(result.timingMs.total).toBeGreaterThanOrEqual(0);
    });
  });
});
