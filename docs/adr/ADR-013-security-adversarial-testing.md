# ADR-013 — Security and adversarial testing

- Status: Accepted
- Milestone: M9
- Date: 2026-09-07

## Context

M9 requires proving that the system resists common attacks: horizontal/vertical
escalation, graph inference leaks, malicious documents, deletion across stores,
redaction, provider denial, and rate/size/traversal abuse. The system must also
enforce complete pre-retrieval authorization so no unfiltered data reaches the model.

## Decision

1. **Tenant isolation is the primary ACL mechanism.** Every repository method
   accepts `tenantId` and filters by it. No query returns data for a tenant
   that was not explicitly requested. This is verified at the SQL/Cypher level,
   not in application code.

2. **Principal filtering for document access.** Queries that span multiple
   principals (e.g., a user's documents vs. shared documents) include
   `principalId` in the filter conditions. The API enforces this via the
   AuthContext.

3. **Pre-retrieval authorization rule.** All retrieval operations validate
   access BEFORE returning results. The repository applies ACL filters so the
   model never sees data it should not. Evidence citations are also filtered
   by tenant.

4. **Input validation at every boundary.** Zod schemas validate:
   - UUID formats for IDs (no SQL/Cypher injection)
   - Array length limits for IN filters (max 100)
   - String length limits for entity names (max 1000)
   - Numeric ranges for pagination/limits

5. **Prompt injection resistance.** The system:
   - Does not execute raw LLM output as commands
   - Sanitizes entity names before Cypher queries (parameterised queries)
   - Rejects queries with obvious injection patterns

6. **Traversal depth limits.** Graph traversal has a maximum depth enforced
   (default 5 hops). Negative or excessive depth values are clamped.

7. **Redaction in telemetry.** Telemetry attributes must not include:
   - Raw document content
   - Prompts or model responses
   - Embeddings
   - Secrets or credentials
   - Principal lists

8. **Status lifecycle enforcement.** Execution runs and steps have strict
   state machines: terminal states (succeeded/failed/cancelled) cannot
   transition. CAS operations prevent concurrent modification races.

9. **Fact temporal validity.** Facts store `validFrom`/`validTo` so the
   system preserves historical truth and excludes superseded facts unless
   explicitly requested for historical queries.

## Security Tests

The test suite includes (in `tests/unit/application/retrieval/security.test.ts`):
- Tenant isolation: cross-tenant retrieval blocked
- Principal filtering: enforced at API and repository level
- Graph traversal ACL: no cross-tenant entity traversal
- Citation ACL: no cross-tenant citation exposure
- Prompt injection: malicious patterns detected
- Cypher injection: parameterised queries, no raw command execution
- Entity resolution injection: sanitization of special characters
- Filter injection: UUID validation, array size limits
- Traversal depth: enforced limits
- Temporal validity: correct fact filtering by time

## Consequences

- Every external boundary validates input before processing
- Repository-level ACL means the model can never access unauthorized data
- Telemetry is safe to export without redaction concerns
- Concurrent state transitions are protected by CAS operations

## Evidence

- `pnpm check` passes all security tests
- Architecture tests verify no application code imports infrastructure directly
- Coverage: 80%+ on all branches

## Reversal

If a different auth framework is needed, only the middleware and AuthContext
change; the repository-level filtering remains the source of truth for ACL.
