import { describe, expect, it } from "vitest";
import { CanonicalEntitySchema, KnowledgeFactSchema } from "../../../src/domain/knowledge/types";

describe("knowledge domain schemas", () => {
  it("accepts nested JSON entity attributes", () => {
    const parsed = CanonicalEntitySchema.parse({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      canonicalName: "Acme",
      entityType: "company",
      attributes: {
        nested: {
          labels: ["a", "b"],
          metrics: { score: 0.9 },
        },
      },
      createdAt: "2024-01-15T10:30:00.000Z",
      validFrom: "2024-01-15T10:30:00.000Z",
    });

    expect(parsed.attributes).toEqual({
      nested: {
        labels: ["a", "b"],
        metrics: { score: 0.9 },
      },
    });
  });

  it("rejects non-JSON entity attributes", () => {
    expect(
      CanonicalEntitySchema.safeParse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        canonicalName: "Acme",
        entityType: "company",
        attributes: {
          createdAt: new Date(),
        },
        createdAt: "2024-01-15T10:30:00.000Z",
        validFrom: "2024-01-15T10:30:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("defaults llm facts to candidate", () => {
    const parsed = KnowledgeFactSchema.parse({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      subjectId: crypto.randomUUID(),
      predicate: "related_to",
      extractionMethod: "llm",
      confidence: 0.7,
      validFrom: "2024-01-15T10:30:00.000Z",
      observedAt: "2024-01-15T10:35:00.000Z",
      createdAt: "2024-01-15T10:40:00.000Z",
      provenance: {
        sourceVersionId: crypto.randomUUID(),
        evidenceText: "evidence",
      },
    });

    expect(parsed.status).toBe("candidate");
  });

  it("rejects invalid fact validity windows", () => {
    expect(
      KnowledgeFactSchema.safeParse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        subjectId: crypto.randomUUID(),
        predicate: "related_to",
        extractionMethod: "human",
        confidence: 0.7,
        validFrom: "2024-01-16T10:30:00.000Z",
        validTo: "2024-01-15T10:30:00.000Z",
        observedAt: "2024-01-15T10:35:00.000Z",
        createdAt: "2024-01-15T10:40:00.000Z",
        provenance: {
          sourceVersionId: crypto.randomUUID(),
          evidenceText: "evidence",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects self superseding facts", () => {
    expect(
      KnowledgeFactSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: crypto.randomUUID(),
        subjectId: crypto.randomUUID(),
        predicate: "related_to",
        extractionMethod: "human",
        confidence: 0.7,
        validFrom: "2024-01-15T10:30:00.000Z",
        observedAt: "2024-01-15T10:35:00.000Z",
        createdAt: "2024-01-15T10:40:00.000Z",
        supersededBy: "11111111-1111-4111-8111-111111111111",
        provenance: {
          sourceVersionId: crypto.randomUUID(),
          evidenceText: "evidence",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects verified facts without evidence", () => {
    expect(
      KnowledgeFactSchema.safeParse({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        subjectId: crypto.randomUUID(),
        predicate: "related_to",
        status: "verified",
        extractionMethod: "human",
        confidence: 0.7,
        validFrom: "2024-01-15T10:30:00.000Z",
        observedAt: "2024-01-15T10:35:00.000Z",
        createdAt: "2024-01-15T10:40:00.000Z",
        provenance: {
          sourceVersionId: crypto.randomUUID(),
        },
      }).success,
    ).toBe(false);
  });
});
