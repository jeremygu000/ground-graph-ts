# ADR-016 — Post-MVP controlled improvement loop

- Status: Accepted
- Milestone: M12
- Date: 2026-09-07

## Context

M12 requires evidence-linked improvement proposals without unsafe autonomous production
modification. Production must never automatically change prompts, ontology, code,
tools, routing, or thresholds solely from live feedback.

## Decision

1. **No autonomous production changes.** The system will NOT automatically modify:
   - Prompts or prompt templates
   - Ontology types or predicates
   - Code or business logic
   - Routing configuration
   - Retrieval thresholds
   - Chunking strategies

2. **Evidence-linked proposals.** Every improvement must be linked to:
   - Trace ID showing the problematic behavior
   - Evaluation case demonstrating the issue
   - Metrics proving the regression

3. **Human approval required.** All changes require human review:
   - Proposals submitted with evidence
   - Reviewed by designated approver
   - Changes deployed through normal release process

4. **Evaluation before deployment.** Changes go through:
   - Local evaluation with golden dataset
   - Shadow deployment (new version receives copy of traffic)
   - Canary deployment (small percentage of production traffic)
   - Full deployment if metrics are positive

5. **Rollback capability.** Every deployment can be rolled back:
   - Version bundle pinned in execution records
   - Previous version can be re-deployed
   - No state is lost during rollback

6. **Drift monitoring.** If production behavior diverges from baseline:
   - Alerts trigger review work
   - Divergence is added to evaluation dataset
   - Proposals must address the specific drift

## Improvement Proposal Schema

```typescript
interface ImprovementProposal {
  id: string;
  createdAt: string;
  createdBy: string;
  type: "prompt" | "threshold" | "routing" | "chunking" | "ontology" | "code";
  evidence: {
    traceIds: string[];
    evaluationCaseIds: string[];
    metrics: Record<string, number>;
  };
  description: string;
  proposedChange: unknown;
  status: "pending" | "approved" | "rejected" | "deployed";
  reviewNotes?: string;
}
```

## Consequences

- Production is stable and predictable
- No silent regressions
- All changes are auditable
- Human judgment remains in control

## Evidence

- Evaluation system in `apps/evaluation-runner/`
- Version bundle on every execution
- Replay mechanism preserves execution lineage
