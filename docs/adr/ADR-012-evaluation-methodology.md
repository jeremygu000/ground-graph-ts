# ADR-012 — Evaluation methodology and CI gates

- Status: Accepted
- Milestone: M8
- Date: 2026-09-07

## Context

M8 requires a reproducible, stage-specific, enforceable quality system. The system must
provide deterministic measurements that can be compared across model/workflow changes,
detect regressions before they reach production, and maintain a growing golden dataset
of verified cases.

## Decision

1. **Evaluation runner in `apps/evaluation-runner/`.** The evaluation runner is a
   standalone Node.js application that runs entirely offline using in-memory doubles
   for embedding and vector index. This ensures reproducibility without network
   dependencies or Docker.

2. **Deterministic in-memory doubles.** `InMemoryEmbeddingAdapter` produces
   deterministic embeddings from content (same input → same output). `InMemoryVectorIndex`
   provides exact kNN lookup. The generator stub returns canned responses based on
   evidence matching. This is the "offline-deterministic" mode for CI.

3. **Golden dataset format.** Datasets are versioned JSON files in `evals/datasets/`.
   Each case includes:
   - `id`, `type`, `tags` for categorization
   - `question`, `tenantId`, `principalId` for query context
   - `expectedStatus` (answered/insufficient_evidence/refused/...)
   - `requiredClaimText` / `forbiddenClaimText` for answer validation
   - `expectedEvidenceChunkIds` for retrieval recall measurement

4. **Metrics tracked.** The baseline report computes:
   - Retrieval recall (expected chunks retrieved / total expected)
   - Citation correctness (correctly cited chunks / total expected)
   - Refusal correctness (% of expected refusals correctly refused)
   - ACL leakage (none expected in baseline)
   - Latency percentiles (P50, P95)
   - Cost estimates (offline stub = $0)

5. **JSONL loader.** `apps/evaluation-runner/src/dataset.ts` provides:
   - `loadDataset(path)` — loads JSON dataset file
   - `loadCorpus(root)` — loads corpus JSON file
   - `loadFromJsonl(path)` — loads JSONL format for large datasets

6. **Report formats.** Reports are written to `evals/reports/`:
   - JSON (machine-readable, full detail)
   - Markdown (human-readable summary)
   - CSV (spreadsheet analysis)

7. **CI gates.** `pnpm eval:smoke` runs the evaluation and exits:
   - Exit code 0 = all cases pass or skip
   - Exit code 1 = any case fails

8. **Baseline experiments.** `pnpm eval:m4:baseline` runs the full M4 vector
   baseline and writes `evals/reports/m4-vector-offline-baseline-v1.json`.

9. **Hard gates (enforced in CI).** As specified in plan.md:
   - Unauthorized retrievals: 0
   - Verified fact provenance: 100%
   - Factual-claim citation coverage: >=95%
   - Citation correctness: >=95%
   - Unsupported factual claims: <3%
   - Refusal correctness: >=90%
   - Labelled entity resolution: >=90%
   - Path validity: >=95%
   - Critical regressions: 0

10. **Dataset growth.** The golden dataset targets >=100 cases. New cases are
    added when:
    - Bug reports reveal missing coverage
    - New entity types or predicates are added to the ontology
    - New evaluation scenarios are discovered

## Consequences

- Evaluation runs are reproducible and fast (no network/Docker required)
- CI gates prevent regressions from reaching production
- The golden dataset grows over time with real-world discoveries
- Offline mode means cost = $0 for baseline evaluation

## Evidence

- `pnpm eval:smoke` runs in <30 seconds locally
- Baseline report written to `evals/reports/m4-vector-offline-baseline-v1.json`
- 40 cases in m4-vector-baseline, targeting 100+ cases

## Reversal

If a different evaluation framework is required (e.g., Phoenix for tracing-based
evaluation), only the runner implementation changes; the ports, dataset format,
and CI gates remain stable.
