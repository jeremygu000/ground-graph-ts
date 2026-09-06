import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
const aiMocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));
vi.mock("ai", () => aiMocks);
vi.mock("@ai-sdk/openai", () => ({ openai: vi.fn(() => ({ model: "mock" })) }));
import { OpenAIGeneratorAdapter } from "../../../../src/infrastructure/models/generator-adapter";
import { ValidationError } from "../../../../src/domain/errors";
import type { GenerationRequest, StructuredAnswer } from "../../../../src/application/models/ports";

describe("OpenAIGeneratorAdapter", () => {
  it("generates and validates a structured answer", async () => {
    aiMocks.generateObject.mockResolvedValueOnce({
      object: {
        answer: "Grounded answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Grounded claim",
            citations: [
              {
                citationId: "22222222-2222-2222-2222-222222222222",
                evidenceId: "33333333-3333-3333-3333-333333333333",
                chunkId: "44444444-4444-4444-8444-444444444444",
                documentVersionId: "55555555-5555-4555-8555-555555555555",
                locatorPath: "doc.md",
                snippet: "evidence",
                startChar: 0,
                endChar: 8,
                score: 1,
              },
            ],
            confidence: 1,
            supportedBy: ["22222222-2222-2222-2222-222222222222"],
          },
        ],
      },
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
      finishReason: "stop",
    });
    const result = await new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" }).generateStructured({
      tenantId: "tenant-1",
      question: "What is grounded?",
      evidence: [],
      allowedCitationIds: ["22222222-2222-2222-2222-222222222222"],
      schema: z.any(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.totalTokens).toBe(5);
  });

  it("aborts structured generation when timeout expires", async () => {
    aiMocks.generateObject.mockImplementation(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    );
    const result = await new OpenAIGeneratorAdapter({
      model: "gpt-4o-mini",
      timeoutMs: 1,
      maxRetries: 1,
    }).generateStructured({
      tenantId: "tenant-1",
      question: "What is grounded?",
      evidence: [],
      allowedCitationIds: [],
      schema: z.any(),
    });
    expect(result.ok).toBe(false);
  });

  it("generates raw completions and applies default usage values", async () => {
    aiMocks.generateText.mockResolvedValueOnce({
      text: "raw answer",
      finishReason: "stop",
      usage: undefined,
    });
    const result = await new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" }).generateRawCompletion(
      "system",
      "user",
    );
    expect(result).toMatchObject({
      ok: true,
      value: { text: "raw answer", promptTokens: 0, completionTokens: 0, finishReason: "stop" },
    });
    expect(aiMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0,
        maxOutputTokens: 512,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns a network error when raw generation fails", async () => {
    aiMocks.generateText.mockRejectedValueOnce(new Error("provider down"));
    const result = await new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" }).generateRawCompletion(
      "system",
      "user",
      { temperature: 0.4, maxTokens: 12 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported providers and retries malformed structured output", async () => {
    const unsupported = await new OpenAIGeneratorAdapter({
      model: "gpt-4o-mini",
      provider: "other" as never,
    }).generateRawCompletion("s", "u");
    expect(unsupported.ok).toBe(false);
    aiMocks.generateObject.mockResolvedValue({ object: { invalid: true }, usage: {} });
    const result = await new OpenAIGeneratorAdapter({
      model: "gpt-4o-mini",
      maxRetries: 2,
    }).generateStructured({
      tenantId: "tenant-1",
      question: "q",
      evidence: [],
      allowedCitationIds: [],
      schema: z.object({ answer: z.string() }) as never,
    });
    expect(result.ok).toBe(false);
    expect(aiMocks.generateObject).toHaveBeenCalledTimes(2);
  });
  describe("constructor", () => {
    it("creates adapter with required model", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" });
      expect(adapter).toBeDefined();
    });

    it("throws ValidationError if model is missing", () => {
      expect(() => new OpenAIGeneratorAdapter({ model: "" })).toThrow(ValidationError);
    });

    it("accepts whitespace model string", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "   " });
      expect(adapter).toBeDefined();
    });

    it("uses default maxRetries of 2", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o" });
      expect(adapter).toBeDefined();
    });

    it("uses custom maxRetries", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o", maxRetries: 5 });
      expect(adapter).toBeDefined();
    });

    it("uses custom timeoutMs", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o", timeoutMs: 30000 });
      expect(adapter).toBeDefined();
    });

    it("uses default timeoutMs of 60000", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o" });
      expect(adapter).toBeDefined();
    });

    it("accepts custom apiKey", () => {
      const adapter = new OpenAIGeneratorAdapter({
        model: "gpt-4o",
        apiKey: "sk-test",
      });
      expect(adapter).toBeDefined();
    });

    it("accepts custom baseUrl", () => {
      const adapter = new OpenAIGeneratorAdapter({
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
      });
      expect(adapter).toBeDefined();
    });

    it("accepts custom organizationId", () => {
      const adapter = new OpenAIGeneratorAdapter({
        model: "gpt-4o",
        organizationId: "org-123",
      });
      expect(adapter).toBeDefined();
    });

    it("accepts defaultGeneration config", () => {
      const adapter = new OpenAIGeneratorAdapter({
        model: "gpt-4o",
        defaultGeneration: {
          temperature: 0.7,
          maxTokens: 2048,
        },
      });
      expect(adapter).toBeDefined();
    });
  });

  describe("getModel", () => {
    it("returns the configured model", () => {
      const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" });
      expect(adapter.getModel()).toBe("gpt-4o-mini");
    });

    it("returns model with custom provider", () => {
      const adapter = new OpenAIGeneratorAdapter({
        model: "gpt-4o-mini",
        provider: "openai",
      });
      expect(adapter.getModel()).toBe("gpt-4o-mini");
    });
  });

  describe("buildPrompt", () => {
    const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" });

    it("builds prompt with question", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "What is GraphRAG?",
        evidence: [],
        allowedCitationIds: [],
        schema: {} as any,
      };
      const { user } = adapter.buildPrompt(request);
      expect(user).toContain("What is GraphRAG?");
    });

    it("includes allowed citation ids in prompt", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [],
        allowedCitationIds: ["cite-1", "cite-2"],
        schema: {} as any,
      };
      const { user } = adapter.buildPrompt(request);
      expect(user).toContain("- cite-1");
      expect(user).toContain("- cite-2");
    });

    it("includes evidence snippets in prompt", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [
          {
            citationId: "cite-1",
            snippet: "GraphRAG is a retrieval-augmented generation approach",
            score: 0.95,
            chunkId: "chunk-1",
            documentVersionId: "ver-1",
            evidenceId: "ev-1",
            locatorPath: "path/1",
            startChar: 0,
            endChar: 100,
          },
        ],
        allowedCitationIds: ["cite-1"],
        schema: {} as any,
      };
      const { user } = adapter.buildPrompt(request);
      expect(user).toContain("[cite-1]");
      expect(user).toContain("GraphRAG is a retrieval-augmented generation approach");
      expect(user).toContain("score=0.950");
    });

    it("handles empty evidence", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [],
        allowedCitationIds: [],
        schema: {} as any,
      };
      const { user } = adapter.buildPrompt(request);
      expect(user).toContain("(none)");
      expect(user).toContain("Evidence (each block is labeled");
    });

    it("uses custom system prompt when provided", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [],
        allowedCitationIds: [],
        schema: {} as any,
        systemPrompt: "You are a helpful assistant.",
      };
      const { system } = adapter.buildPrompt(request);
      expect(system).toBe("You are a helpful assistant.");
    });

    it("uses default system prompt when not provided", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [],
        allowedCitationIds: [],
        schema: {} as any,
      };
      const { system } = adapter.buildPrompt(request);
      expect(system).toContain("grounded answering system");
    });

    it("formats score with fixed 3 decimal places", () => {
      const request: GenerationRequest = {
        tenantId: "tenant-1",
        question: "Test?",
        evidence: [
          {
            citationId: "cite-1",
            snippet: "Test content",
            score: 0.123456,
            chunkId: "chunk-1",
            documentVersionId: "ver-1",
            evidenceId: "ev-1",
            locatorPath: "path/1",
            startChar: 0,
            endChar: 100,
          },
        ],
        allowedCitationIds: ["cite-1"],
        schema: {} as any,
      };
      const { user } = adapter.buildPrompt(request);
      expect(user).toContain("score=0.123");
    });
  });

  describe("filterCitations", () => {
    const adapter = new OpenAIGeneratorAdapter({ model: "gpt-4o-mini" });

    it("filters out disallowed citation ids", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Test claim",
            citations: [
              {
                citationId: "cite-1",
                evidenceId: "ev-1",
                chunkId: "chunk-1",
                documentVersionId: "ver-1",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.9,
              },
              {
                citationId: "cite-2",
                evidenceId: "ev-2",
                chunkId: "chunk-2",
                documentVersionId: "ver-2",
                locatorPath: "path2",
                snippet: "text2",
                startChar: 0,
                endChar: 10,
                score: 0.8,
              },
            ],
            confidence: 0.9,
            supportedBy: ["cite-1"],
          },
        ],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.claims[0]!.citations).toHaveLength(1);
      expect(result.claims[0]!.citations[0]!.citationId).toBe("cite-1");
    });

    it("changes status to insufficient_evidence when no citations remain", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Test claim",
            citations: [
              {
                citationId: "cite-2",
                evidenceId: "ev-2",
                chunkId: "chunk-2",
                documentVersionId: "ver-2",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.9,
              },
            ],
            confidence: 0.9,
            supportedBy: ["cite-2"],
          },
        ],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.status).toBe("insufficient_evidence");
    });

    it("preserves claims without citations", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Test claim",
            citations: [],
            confidence: 0.9,
            supportedBy: [],
          },
        ],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.claims).toHaveLength(1);
      expect(result.status).toBe("insufficient_evidence");
    });

    it("preserves status when already insufficient_evidence", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "insufficient_evidence",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Test claim",
            citations: [
              {
                citationId: "cite-2",
                evidenceId: "ev-2",
                chunkId: "chunk-2",
                documentVersionId: "ver-2",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.9,
              },
            ],
            confidence: 0.9,
            supportedBy: ["cite-2"],
          },
        ],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.status).toBe("insufficient_evidence");
    });

    it("removes claims with no valid citations when some claims have citations", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Claim with valid cite",
            citations: [
              {
                citationId: "cite-1",
                evidenceId: "ev-1",
                chunkId: "chunk-1",
                documentVersionId: "ver-1",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.9,
              },
            ],
            confidence: 0.9,
            supportedBy: ["cite-1"],
          },
          {
            claimId: "22222222-2222-2222-2222-222222222222",
            claimText: "Claim without valid cite",
            citations: [
              {
                citationId: "cite-2",
                evidenceId: "ev-2",
                chunkId: "chunk-2",
                documentVersionId: "ver-2",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.8,
              },
            ],
            confidence: 0.8,
            supportedBy: ["cite-2"],
          },
        ],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0]!.claimText).toBe("Claim with valid cite");
      expect(result.status).toBe("answered");
    });

    it("handles empty allowedCitationIds", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [
          {
            claimId: "11111111-1111-1111-1111-111111111111",
            claimText: "Test claim",
            citations: [
              {
                citationId: "cite-1",
                evidenceId: "ev-1",
                chunkId: "chunk-1",
                documentVersionId: "ver-1",
                locatorPath: "path",
                snippet: "text",
                startChar: 0,
                endChar: 10,
                score: 0.9,
              },
            ],
            confidence: 0.9,
            supportedBy: ["cite-1"],
          },
        ],
      };
      const result = adapter.filterCitations(answer, []);
      expect(result.status).toBe("insufficient_evidence");
    });

    it("handles empty claims array", () => {
      const answer: StructuredAnswer = {
        answer: "Test answer",
        status: "answered",
        claims: [],
      };
      const result = adapter.filterCitations(answer, ["cite-1"]);
      expect(result.claims).toHaveLength(0);
      expect(result.status).toBe("insufficient_evidence");
    });
  });
});
