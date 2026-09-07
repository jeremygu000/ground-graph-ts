import { describe, expect, it, vi } from "vitest";
import { GraphReconciliationService } from "../../../../src/application/extraction/reconciliation";
import type {
  CanonicalEntity,
  KnowledgeFact,
} from "../../../../src/domain/knowledge/knowledge.schema";

const entity = (id: string): CanonicalEntity => ({
  id,
  tenantId: "22222222-2222-4222-8222-222222222222",
  canonicalName: id,
  entityType: "service",
  aliases: [],
  attributes: {},
  createdAt: "2024-01-01T00:00:00.000Z",
  validFrom: "2024-01-01T00:00:00.000Z",
  principalIds: [],
});
const fact = (overrides: Partial<KnowledgeFact> = {}): KnowledgeFact => ({
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  subjectId: "33333333-3333-4333-8333-333333333333",
  predicate: "uses",
  status: "verified",
  extractionMethod: "llm",
  confidence: 0.9,
  provenance: {
    sourceVersionId: "44444444-4444-4444-8444-444444444444",
    chunkId: "55555555-5555-4555-8555-555555555555",
  },
  validFrom: "2024-01-01T00:00:00.000Z",
  observedAt: "2024-01-01T00:00:00.000Z",
  createdAt: "2024-01-01T00:00:00.000Z",
  ...overrides,
});

describe("GraphReconciliationService", () => {
  it("projects candidate facts without resolving entities", async () => {
    const graphRepo = { projectFact: vi.fn().mockResolvedValue({ ok: true, value: undefined }) };
    const entityRepo = { findById: vi.fn() };
    const service = new GraphReconciliationService(graphRepo as any, {} as any, entityRepo as any);
    const result = await service.reconcileFact(fact({ status: "candidate" }), "tenant");
    expect(result.ok).toBe(true);
    expect(entityRepo.findById).not.toHaveBeenCalled();
  });

  it("projects real entity data from PostgreSQL when entity exists", async () => {
    const graphRepo = {
      projectFact: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      projectEntity: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const entityRepo = {
      findById: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          id: "33333333-3333-4333-8333-333333333333",
          tenantId: "22222222-2222-4222-8222-222222222222",
          canonicalName: "TestEntity",
          entityType: "service",
          aliases: [],
          attributes: {},
          createdAt: "2024-01-01T00:00:00.000Z",
          validFrom: "2024-01-01T00:00:00.000Z",
          principalIds: [],
        },
      }),
    };
    const service = new GraphReconciliationService(graphRepo as any, {} as any, entityRepo as any);
    const result = await service.reconcileFact(fact(), "tenant");
    expect(result.ok).toBe(true);
    expect(graphRepo.projectEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "33333333-3333-4333-8333-333333333333",
        canonicalName: "TestEntity",
        entityType: "service",
      }),
    );
  });

  it("skips projection when entity not found in PostgreSQL", async () => {
    const graphRepo = {
      projectFact: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      projectEntity: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const entityRepo = {
      findById: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const service = new GraphReconciliationService(graphRepo as any, {} as any, entityRepo as any);
    const result = await service.reconcileFact(fact(), "tenant");
    expect(result.ok).toBe(true);
    expect(graphRepo.projectEntity).not.toHaveBeenCalled();
  });

  it("projects object entity when objectId entity exists", async () => {
    const graphRepo = {
      projectFact: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      projectEntity: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const entityRepo = {
      findById: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          id: "66666666-6666-4666-8666-666666666666",
          tenantId: "22222222-2222-4222-8222-222222222222",
          canonicalName: "ObjectEntity",
          entityType: "service",
          aliases: [],
          attributes: {},
          createdAt: "2024-01-01T00:00:00.000Z",
          validFrom: "2024-01-01T00:00:00.000Z",
          principalIds: [],
        },
      }),
    };
    const service = new GraphReconciliationService(graphRepo as any, {} as any, entityRepo as any);
    const result = await service.reconcileFact(
      fact({ objectId: "66666666-6666-4666-8666-666666666666" }),
      "tenant",
    );
    expect(result.ok).toBe(true);
    expect(graphRepo.projectEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "66666666-6666-4666-8666-666666666666",
        canonicalName: "ObjectEntity",
      }),
    );
  });

  it("reconciles verified facts and records individual failures", async () => {
    const facts = [fact(), fact({ id: "77777777-7777-4777-8777-777777777777" })];
    const graphRepo = {
      projectFact: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: undefined })
        .mockResolvedValueOnce({ ok: false, error: new Error("bad fact") }),
      projectEntity: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const factRepo = { findByStatus: vi.fn().mockResolvedValue({ ok: true, value: facts }) };
    const entityRepo = {
      findById: vi.fn().mockResolvedValue({ ok: true, value: entity("subject") }),
    };
    const report = await new GraphReconciliationService(
      graphRepo as any,
      factRepo as any,
      entityRepo as any,
    ).reconcileAll("tenant");
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(report.value).toMatchObject({ factsReconciled: 1, factsFailed: 1 });
      expect(report.value.errors[0]?.factId).toBe(facts[1]?.id);
    }
  });

  it("returns an error report when fact lookup fails", async () => {
    const service = new GraphReconciliationService(
      {} as any,
      { findByStatus: vi.fn().mockResolvedValue({ ok: false, error: new Error("db") }) } as any,
      {} as any,
    );
    const result = await service.reconcileAll("tenant");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Failed to fetch verified facts");
    }
  });
});
