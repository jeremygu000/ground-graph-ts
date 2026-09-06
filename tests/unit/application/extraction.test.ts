import { describe, expect, it, vi, beforeEach } from "vitest";
import { OntologyValidationService } from "../../../src/application/extraction/ontology-validation";
import type {
  CanonicalEntity,
  KnowledgeFact,
} from "../../../src/domain/knowledge/knowledge.schema";
import { classifyMention } from "../../../src/application/extraction/llm-extraction-port";
import type { ResolutionBand } from "../../../src/application/extraction/llm-extraction.types";
import type { ValidationRule } from "../../../src/application/extraction/ontology-validation.types";
import {
  ReviewQueueItemSchema,
  ReviewStatusSchema,
  ReviewItemTypeSchema,
  GraphMetricsSchema,
} from "../../../src/domain/knowledge/review.schema";

describe("OntologyValidationService", () => {
  const createMockEntity = (overrides: Partial<CanonicalEntity> = {}): CanonicalEntity => ({
    id: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    canonicalName: "Test Entity",
    entityType: "person",
    aliases: [],
    attributes: {},
    createdAt: "2024-01-01T00:00:00.000Z",
    validFrom: "2024-01-01T00:00:00.000Z",
    ...overrides,
  });

  const createMockFact = (overrides: Partial<KnowledgeFact> = {}): KnowledgeFact => ({
    id: crypto.randomUUID(),
    tenantId: crypto.randomUUID(),
    subjectId: crypto.randomUUID(),
    predicate: "knows",
    status: "verified",
    extractionMethod: "llm",
    confidence: 0.9,
    provenance: { sourceVersionId: crypto.randomUUID(), chunkId: crypto.randomUUID() },
    validFrom: "2024-01-01T00:00:00.000Z",
    observedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  });

  describe("TemporalConsistencyRule", () => {
    it("passes when validFrom < validTo", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity({
        validFrom: "2024-01-01T00:00:00.000Z",
        validTo: "2024-12-31T23:59:59.999Z",
      });

      const result = service.validate(entity, []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when validTo <= validFrom", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity({
        validFrom: "2024-12-31T23:59:59.999Z",
        validTo: "2024-01-01T00:00:00.000Z",
      });

      const result = service.validate(entity, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "TEMPORAL_INVALID")).toBe(true);
    });

    it("fails when fact validTo <= validFrom", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity();
      const fact = createMockFact({
        validFrom: "2024-12-31T23:59:59.999Z",
        validTo: "2024-01-01T00:00:00.000Z",
      });

      const result = service.validate(entity, [fact]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "FACT_TEMPORAL_INVALID")).toBe(true);
    });
  });

  describe("ProvenanceRequiredRule", () => {
    it("passes verified fact with provenance", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity();
      const fact = createMockFact({
        status: "verified",
        provenance: { sourceVersionId: crypto.randomUUID(), chunkId: crypto.randomUUID() },
      });

      const result = service.validate(entity, [fact]);
      expect(result.valid).toBe(true);
    });

    it("fails verified fact without provenance", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity();
      const fact = createMockFact({
        status: "verified",
        provenance: { sourceVersionId: crypto.randomUUID() },
      });

      const result = service.validate(entity, [fact]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "PROVENANCE_MISSING")).toBe(true);
    });

    it("passes candidate fact without provenance", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity();
      const fact = createMockFact({
        status: "candidate",
        provenance: { sourceVersionId: crypto.randomUUID() },
      });

      const result = service.validate(entity, [fact]);
      expect(result.valid).toBe(true);
    });
  });

  describe("EntityUniquenessRule", () => {
    it("fails when entity supersedes itself", () => {
      const service = new OntologyValidationService();
      const id = crypto.randomUUID();
      const entity = createMockEntity({ id, supersededBy: id });

      const result = service.validate(entity, []);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "SELF_SUPERSESSION")).toBe(true);
    });
  });

  describe("AliasUniquenessRule", () => {
    it("warns on duplicate aliases", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity({
        aliases: ["alias1", "alias2", "alias1"],
      });

      const result = service.validate(entity, []);
      expect(result.warnings.some((w) => w.code === "DUPLICATE_ALIASES")).toBe(true);
    });

    it("warns when canonical name is also an alias", () => {
      const service = new OntologyValidationService();
      const entity = createMockEntity({
        canonicalName: "SameName",
        aliases: ["Other", "SameName"],
      });

      const result = service.validate(entity, []);
      expect(result.warnings.some((w) => w.code === "ALIAS_MATCHES_CANONICAL")).toBe(true);
    });
  });

  describe("addRule", () => {
    it("adds custom validation rule", () => {
      const service = new OntologyValidationService();
      const customRule: ValidationRule = {
        name: "custom_rule",
        validate: () => ({
          valid: true,
          errors: [],
          warnings: [{ code: "CUSTOM_WARN", message: "custom warning" }],
        }),
      };

      service.addRule(customRule);
      const entity = createMockEntity();
      const result = service.validate(entity, []);

      expect(result.warnings.some((w) => w.code === "CUSTOM_WARN")).toBe(true);
    });
  });
});

describe("SupersessionService", () => {
  const mockFactRepo = {
    findById: vi.fn(),
    updateStatus: vi.fn(),
    supersede: vi.fn(),
    supersedeWithStatus: vi.fn(),
  };
  const mockEntityRepo = {
    supersede: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects self-supersession for entity", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();
    const entityId = crypto.randomUUID();

    const result = await service.supersedeEntity(entityId, entityId, tenantId);
    expect(result.ok).toBe(false);
  });

  it("rejects self-supersession for fact", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockFactRepo.findById.mockResolvedValue({ ok: true, value: { id: "same-id" } });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();
    const factId = "same-id";

    const result = await service.supersedeFact(factId, factId, tenantId);
    expect(result.ok).toBe(false);
  });

  it("fails when fact to supersede not found", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockFactRepo.findById.mockResolvedValueOnce({ ok: true, value: null });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();
    const factId = crypto.randomUUID();
    const supersededById = crypto.randomUUID();

    const result = await service.supersedeFact(factId, supersededById, tenantId);
    expect(result.ok).toBe(false);
  });

  it("fails when superseding fact not found", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockFactRepo.findById
      .mockResolvedValueOnce({ ok: true, value: { id: "fact1" } })
      .mockResolvedValueOnce({ ok: true, value: null });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();

    const result = await service.supersedeFact("fact1", "fact2", tenantId);
    expect(result.ok).toBe(false);
  });

  it("successfully supersedes fact", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockFactRepo.findById
      .mockResolvedValueOnce({ ok: true, value: { id: "fact1" } })
      .mockResolvedValueOnce({ ok: true, value: { id: "fact2" } });
    mockFactRepo.supersedeWithStatus.mockResolvedValue({ ok: true, value: undefined });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();

    const result = await service.supersedeFact("fact1", "fact2", tenantId);
    expect(result.ok).toBe(true);
  });

  it("propagates status and supersede failures", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockFactRepo.findById
      .mockResolvedValueOnce({ ok: true, value: { id: "fact1" } })
      .mockResolvedValueOnce({ ok: true, value: { id: "fact2" } });
    mockFactRepo.supersedeWithStatus.mockResolvedValue({ ok: false, error: new Error("status") });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    expect((await service.supersedeFact("fact1", "fact2", "tenant")).ok).toBe(false);

    mockFactRepo.supersedeWithStatus.mockResolvedValue({ ok: true, value: undefined });
    mockFactRepo.findById
      .mockResolvedValueOnce({ ok: true, value: { id: "fact1" } })
      .mockResolvedValueOnce({ ok: true, value: { id: "fact2" } });
    expect((await service.supersedeFact("fact1", "fact2", "tenant")).ok).toBe(true);
    mockEntityRepo.supersede.mockResolvedValue({ ok: false, error: new Error("entity") });
    expect((await service.supersedeEntity("entity1", "entity2", "tenant")).ok).toBe(false);
  });

  it("successfully supersedes entity", async () => {
    const { SupersessionService } =
      await import("../../../src/application/extraction/reconciliation");
    mockEntityRepo.supersede.mockResolvedValue({ ok: true, value: undefined });
    const service = new SupersessionService(mockFactRepo as any, mockEntityRepo as any);
    const tenantId = crypto.randomUUID();

    const result = await service.supersedeEntity("entity1", "entity2", tenantId);
    expect(result.ok).toBe(true);
  });
});

describe("classifyMention", () => {
  it("returns high_confidence for 0.95", () => {
    const band = classifyMention(0.95);
    expect(band.name).toBe("high_confidence");
    expect(band.action).toBe("create_entity");
  });

  it("returns medium_confidence for 0.8", () => {
    const band = classifyMention(0.8);
    expect(band.name).toBe("medium_confidence");
    expect(band.action).toBe("link_entity");
  });

  it("returns low_confidence for 0.6", () => {
    const band = classifyMention(0.6);
    expect(band.name).toBe("low_confidence");
    expect(band.action).toBe("review");
  });

  it("returns very_low_confidence for 0.3", () => {
    const band = classifyMention(0.3);
    expect(band.name).toBe("very_low_confidence");
    expect(band.action).toBe("reject");
  });

  it("returns very_low_confidence for 0.0", () => {
    const band = classifyMention(0.0);
    expect(band.name).toBe("very_low_confidence");
    expect(band.action).toBe("reject");
  });

  it("uses custom bands when provided", () => {
    const customBands: ResolutionBand[] = [
      { name: "exact", minConfidence: 0.999, maxConfidence: 1.0, action: "create_entity" },
      { name: "high", minConfidence: 0.8, maxConfidence: 0.999, action: "link_entity" },
    ];
    const band = classifyMention(0.999, customBands);
    expect(band.name).toBe("exact");
  });
});

describe("ReviewQueueItemSchema", () => {
  it("parses valid review queue item", () => {
    const item = {
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      itemType: "entity",
      itemId: crypto.randomUUID(),
      status: "pending",
      priority: 5,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    const result = ReviewQueueItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  it("rejects invalid review status", () => {
    const item = {
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      itemType: "entity",
      itemId: crypto.randomUUID(),
      status: "invalid",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    const result = ReviewQueueItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

describe("ReviewStatusSchema", () => {
  it("parses valid statuses", () => {
    expect(ReviewStatusSchema.safeParse("pending").success).toBe(true);
    expect(ReviewStatusSchema.safeParse("approved").success).toBe(true);
    expect(ReviewStatusSchema.safeParse("rejected").success).toBe(true);
    expect(ReviewStatusSchema.safeParse("superseded").success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(ReviewStatusSchema.safeParse("unknown").success).toBe(false);
  });
});

describe("ReviewItemTypeSchema", () => {
  it("parses valid item types", () => {
    expect(ReviewItemTypeSchema.safeParse("entity").success).toBe(true);
    expect(ReviewItemTypeSchema.safeParse("fact").success).toBe(true);
    expect(ReviewItemTypeSchema.safeParse("mention").success).toBe(true);
    expect(ReviewItemTypeSchema.safeParse("extraction").success).toBe(true);
  });
});

describe("GraphMetricsSchema", () => {
  it("parses valid graph metrics", () => {
    const metrics = {
      tenantId: crypto.randomUUID(),
      timestamp: "2024-01-01T00:00:00.000Z",
      totalEntities: 100,
      totalFacts: 500,
      verifiedFacts: 400,
      candidateFacts: 100,
      pendingReviews: 10,
      entityTypes: { person: 50, organization: 50 },
      predicateCounts: { knows: 200, works_at: 300 },
      avgConfidence: 0.85,
    };

    const result = GraphMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it("rejects invalid confidence", () => {
    const metrics = {
      tenantId: crypto.randomUUID(),
      timestamp: "2024-01-01T00:00:00.000Z",
      totalEntities: 100,
      totalFacts: 500,
      verifiedFacts: 400,
      candidateFacts: 100,
      pendingReviews: 10,
      entityTypes: {},
      predicateCounts: {},
      avgConfidence: 1.5,
    };

    const result = GraphMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(false);
  });
});
