import { describe, expect, it, beforeEach } from "vitest";
import { InMemoryImprovementAdapter } from "../../../../src/infrastructure/improvement/adapter";

describe("InMemoryImprovementAdapter", () => {
  let adapter: InMemoryImprovementAdapter;
  const tenantId = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    adapter = new InMemoryImprovementAdapter();
  });

  function createValidProposalInput() {
    return {
      tenantId,
      title: "Test Proposal",
      description: "A test proposal",
      type: "threshold_adjustment" as const,
      change: {
        targetType: "threshold_adjustment" as const,
        targetPath: "retrieval.citationThreshold",
        currentValue: 0.6,
        proposedValue: 0.95,
        rollbackValue: 0.6,
        justification: "Better precision needed",
      },
      evidence: [{ type: "eval_result_id" as const, id: "eval-1", relevanceScore: 0.9 }],
    };
  }

  describe("createProposal", () => {
    it("creates a proposal with draft status", async () => {
      const input = createValidProposalInput();

      const proposal = await adapter.createProposal(input);

      expect(proposal.id).toBeDefined();
      expect(proposal.tenantId).toBe(tenantId);
      expect(proposal.title).toBe("Test Proposal");
      expect(proposal.status).toBe("draft");
      expect(proposal.rolloutStage).toBeUndefined();
    });
  });

  describe("getProposal", () => {
    it("returns null for non-existent proposal", async () => {
      const result = await adapter.getProposal("non-existent-id", tenantId);
      expect(result).toBeNull();
    });

    it("returns proposal after creation", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      const result = await adapter.getProposal(created.id, tenantId);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
    });

    it("returns null for different tenant", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      const result = await adapter.getProposal(created.id, "00000000-0000-4000-8000-000000000099");
      expect(result).toBeNull();
    });
  });

  describe("listProposals", () => {
    it("returns empty list when no proposals exist", async () => {
      const results = await adapter.listProposals({ tenantId });
      expect(results).toHaveLength(0);
    });

    it("filters by tenantId", async () => {
      await adapter.createProposal(createValidProposalInput());

      const otherTenantId = "00000000-0000-4000-8000-000000000002";
      const otherInput = createValidProposalInput();
      otherInput.tenantId = otherTenantId;
      otherInput.title = "Tenant B Proposal";
      await adapter.createProposal(otherInput);

      const results = await adapter.listProposals({ tenantId });
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Test Proposal");
    });

    it("filters by status", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      await adapter.approveProposal({
        proposalId: created.id,
        tenantId,
        approvedBy: "admin",
      });

      const draftResults = await adapter.listProposals({ tenantId, status: "draft" });
      expect(draftResults).toHaveLength(0);

      const approvedResults = await adapter.listProposals({ tenantId, status: "approved" });
      expect(approvedResults).toHaveLength(1);
    });
  });

  describe("approveProposal", () => {
    it("approves a draft proposal", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      const approved = await adapter.approveProposal({
        proposalId: created.id,
        tenantId,
        approvedBy: "admin@example.com",
      });

      expect(approved.status).toBe("approved");
      expect(approved.approvedBy).toBe("admin@example.com");
      expect(approved.approvedAt).toBeDefined();
    });

    it("throws for non-existent proposal", async () => {
      await expect(
        adapter.approveProposal({
          proposalId: "non-existent",
          tenantId,
          approvedBy: "admin",
        }),
      ).rejects.toThrow("Proposal non-existent not found");
    });
  });

  describe("rejectProposal", () => {
    it("rejects a proposal with reason", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      const rejected =       await adapter.rejectProposal({
        proposalId: created.id,
        tenantId,
        rejectedBy: "admin@example.com",
        reason: "Not enough evidence",
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.rejectedBy).toBe("admin@example.com");
      expect(rejected.rejectionReason).toBe("Not enough evidence");
    });
  });

  describe("advanceRollout", () => {
    it("advances rollout through stages", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      await adapter.approveProposal({
        proposalId: created.id,
        tenantId,
        approvedBy: "admin",
      });

      const local = await adapter.advanceRollout({
        proposalId: created.id,
        tenantId,
        stage: "local",
        notes: "Testing locally",
      });

      expect(local.status).toBe("in_progress");
      expect(local.rolloutStage).toBe("local");

      const shadow = await adapter.advanceRollout({
        proposalId: created.id,
        tenantId,
        stage: "shadow",
      });

      expect(shadow.rolloutStage).toBe("shadow");

      const production = await adapter.advanceRollout({
        proposalId: created.id,
        tenantId,
        stage: "production",
      });

      expect(production.status).toBe("completed");
      expect(production.rolloutStage).toBe("production");
    });
  });

  describe("rollbackProposal", () => {
    it("rolls back an in-progress proposal", async () => {
      const created = await adapter.createProposal(createValidProposalInput());

      await adapter.approveProposal({
        proposalId: created.id,
        tenantId,
        approvedBy: "admin",
      });

      await adapter.advanceRollout({
        proposalId: created.id,
        tenantId,
        stage: "local",
      });

      const rolledBack = await adapter.rollbackProposal({
        proposalId: created.id,
        tenantId,
        rolledBackBy: "admin",
        reason: "Issues detected",
      });

      expect(rolledBack.status).toBe("rolled_back");
      expect(rolledBack.rolloutStage).toBeUndefined();
    });
  });

  describe("drift reports", () => {
    it("creates and retrieves drift reports", async () => {
      const report = await adapter.createDriftReport({
        tenantId,
        type: "config_drift",
        severity: "high",
        description: "Retrieval latency increased",
        expectedValue: "p99 < 500ms",
        actualValue: "p99 = 800ms",
      });

      expect(report.id).toBeDefined();
      expect(report.reviewStatus).toBe("pending");

      const retrieved = await adapter.getDriftReport(report.id, tenantId);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(report.id);
    });

    it("filters drift reports by review status", async () => {
      const report1 = await adapter.createDriftReport({
        tenantId,
        type: "config_drift",
        severity: "high",
        description: "Report 1",
        expectedValue: "ok",
        actualValue: "bad",
      });

      const report2 = await adapter.createDriftReport({
        tenantId,
        type: "config_drift",
        severity: "high",
        description: "Report 2",
        expectedValue: "ok",
        actualValue: "bad",
      });

      await adapter.reviewDriftReport(report1.id, tenantId, "admin", "resolved");

      const pending = await adapter.listDriftReports({ tenantId, reviewStatus: "pending" });
      expect(pending).toHaveLength(1);
      expect(pending[0]!.id).toBe(report2.id);

      const resolved = await adapter.listDriftReports({ tenantId, reviewStatus: "resolved" });
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.id).toBe(report1.id);
    });

    it("filters drift reports by severity and type", async () => {
      await adapter.createDriftReport({
        tenantId,
        type: "config_drift",
        severity: "high",
        description: "High config drift",
        expectedValue: "ok",
        actualValue: "bad",
      });

      await adapter.createDriftReport({
        tenantId,
        type: "model_drift",
        severity: "low",
        description: "Low model drift",
        expectedValue: "ok",
        actualValue: "drifted",
      });

      const bySeverity = await adapter.listDriftReports({ tenantId, severity: "high" });
      expect(bySeverity).toHaveLength(1);
      expect(bySeverity[0]!.severity).toBe("high");

      const byType = await adapter.listDriftReports({ tenantId, type: "model_drift" });
      expect(byType).toHaveLength(1);
      expect(byType[0]!.type).toBe("model_drift");
    });

    it("throws for non-existent drift report review", async () => {
      await expect(
        adapter.reviewDriftReport("non-existent-id", tenantId, "admin", "resolved"),
      ).rejects.toThrow("Drift report non-existent-id not found");
    });
  });

  describe("clusterFailures", () => {
    it("creates a failure cluster", async () => {
      const clusters = await adapter.clusterFailures({
        tenantId,
        timeWindowMinutes: 60,
        minOccurrences: 5,
      });

      expect(clusters).toHaveLength(1);
      expect(clusters[0]!.failurePattern).toBe("Elevated error rate in retrieval");
      expect(clusters[0]!.occurrenceCount).toBe(5);
    });

    it("returns existing clusters within time window", async () => {
      await adapter.clusterFailures({
        tenantId,
        timeWindowMinutes: 60,
        minOccurrences: 3,
      });

      const clusters = await adapter.clusterFailures({
        tenantId,
        timeWindowMinutes: 60,
        minOccurrences: 3,
      });

      expect(clusters).toHaveLength(1);
    });
  });

  describe("getMetrics", () => {
    it("returns correct metrics", async () => {
      await adapter.createProposal(createValidProposalInput());

      const metrics = await adapter.getMetrics(tenantId);
      expect(metrics.totalProposals).toBe(1);
    });
  });
});
