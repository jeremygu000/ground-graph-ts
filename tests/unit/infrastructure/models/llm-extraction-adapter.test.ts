import { describe, expect, it, vi } from "vitest";
const ai = vi.hoisted(() => ({ generateObject: vi.fn() }));
vi.mock("ai", () => ai);
import {
  LlmExtractionAdapter,
  NoopLlmExtractor,
} from "../../../../src/infrastructure/models/llm-extraction-adapter";

const chunk = {
  id: "11111111-1111-4111-8111-111111111111",
  documentVersionId: "22222222-2222-4222-8222-222222222222",
  principalId: "33333333-3333-4333-8333-333333333333",
  sequenceNumber: 0,
  content: "GroundGraph uses PostgreSQL.",
  contentHash: "hash",
  locator: { type: "line" as const, path: "doc.md" },
  createdAt: "2024-01-01T00:00:00.000Z",
};
const output = {
  entities: [
    { name: "GroundGraph", type: "service", confidence: 0.9 },
    { name: "PostgreSQL", type: "database", confidence: 0.8 },
  ],
  facts: [
    { subjectName: "GroundGraph", predicate: "uses", objectName: "PostgreSQL", confidence: 0.9 },
  ],
  mentions: [{ text: "GroundGraph", startChar: 0, endChar: 10 }],
};

describe("LlmExtractionAdapter", () => {
  it("builds a prompt and applies entity/fact limits", async () => {
    ai.generateObject.mockResolvedValue({ object: output });
    const result = await new LlmExtractionAdapter({ model: "mock" }).extract(chunk, {
      tenantId: "t",
      principalId: "p",
      maxEntities: 1,
      maxFacts: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { entities: [output.entities[0]], facts: [], mentions: output.mentions },
    });
    expect(ai.generateObject).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining(chunk.content) }),
    );
  });

  it("uses an explicit extraction prompt and returns provider failures", async () => {
    ai.generateObject.mockResolvedValue({ object: output });
    await new LlmExtractionAdapter({ model: "mock" }).extract(chunk, {
      tenantId: "t",
      principalId: "p",
      extractionPrompt: "custom",
    });
    expect(ai.generateObject).toHaveBeenLastCalledWith(
      expect.objectContaining({ prompt: "custom" }),
    );
    ai.generateObject.mockRejectedValueOnce(new Error("provider down"));
    const result = await new LlmExtractionAdapter({ model: "mock" }).extract(chunk, {
      tenantId: "t",
      principalId: "p",
    });
    expect(result.ok).toBe(false);
  });

  it("returns empty results from the no-op extractor", async () => {
    expect(
      await new NoopLlmExtractor().extract(chunk, { tenantId: "t", principalId: "p" }),
    ).toEqual({ ok: true, value: { entities: [], facts: [], mentions: [] } });
  });
});
