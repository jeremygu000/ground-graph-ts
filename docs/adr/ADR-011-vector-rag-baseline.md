# ADR-011 — Vector RAG baseline: ports, AI SDK adapters, fusion, citations

- Status: Accepted
- Milestone: M4
- Date: 2026-09-06

## Context

M4 requires a measurable, evidence-only vector retrieval baseline. The system
must answer grounded questions with citations or refuse, while remaining
reproducible and easy to test without live model calls. The current stack
already provides pgvector, full-text search via tsvector, and OTel spans; what
is missing is the typed port/adapter layer, the deterministic fusion logic,
the structured-output pipeline, and the dataset/eval plumbing.

## Decision

1. **Layered ports in `application/models/ports.ts`.** All M4 contracts
   (`EmbeddingPort`, `RerankPort`, `GeneratorPort`, `VectorIndexPort`,
   `FullTextSearchPort`, `RetrievalFusionPort`, `CitationBuilderPort`,
   `VectorQueryService`, `StructuredOutputParser<T>`, `VectorPipelineConfig`,
   `RetrievalExecutionResult`) live in the application layer alongside
   `StructuredAnswerSchema`. The application layer never imports the AI SDK
   or pg.

2. **AI SDK v7 adapters in `infrastructure/models/`.** `OpenAIEmbeddingAdapter`,
   `LexicalRerankAdapter` / `NoopRerankAdapter`, and `OpenAIGeneratorAdapter`
   are the concrete AI SDK OpenAI-backed implementations. The embedding
   adapter batches calls (default 96), retries with exponential backoff and
   jitter, validates the returned dimension against the configured
   `EmbeddingConfig.dimension`, and supports a deterministic local
   `deterministicLocalEmbedding` fallback for tests.

3. **Zod structured output with one repair.** `ZodStructuredOutputParser` parses
   the AI SDK's `generateObject` result. On failure it tries
   `tryRecoverJson` + `extractBalancedJsonObject` twice and otherwise fails
   closed. `DefaultRepairStrategy` strips code fences, trailing commas, and
   backticks. The interface `StructuredAnswer` and the Zod schema are kept
   type-compatible via a `z.ZodType<StructuredAnswer>` annotation so the
   generator's structured output is type-checked end-to-end.

4. **pgvector + GIN/tsvector.** `PostgresVectorIndexAdapter` exposes
   `createIndexVersion`, `getActiveIndexVersion`, `upsertEmbeddings`,
   `search`, and `deleteByDocumentVersion`. The HNSW index and the GIN
   tsvector index are added in migration `0002_fulltext_and_vector_indexes.sql`.
   All SQL uses parameterised `sql` templates, pre-filters by `tenantId`, and
   enforces the configured dimension.

5. **Deterministic fusion.** `ReciprocalRankFusion` (default `k=60`) and
   `ConvexFusion` both honour configurable weights, dedup by chunkId, and
   produce a stable ordering. `traceFusion` records the per-strategy
   input/fused counts and weights for telemetry.

6. **Citation builder.** `CitationBuilder` derives a stable
   `CIT-<index>-<chunkIdPrefix>` id and an `EV-<chunkIdPrefix>-<index>` evidence
   id, and turns retrieval results into `CitationOutput` and
   `EvidenceReference` values. The vector query service re-uses the same
   builder so M4, M5, and M6 can all emit comparable citations.

7. **Vector query service.** `DefaultVectorQueryService` orchestrates
   embed → vector search → full-text search → fusion → rerank → citation.
   It refuses graph/hybrid strategies, validates dimension match against the
   active index version, and records `vector.query.*` metrics and OTel spans.
   It is the M4/M6/M7 seam; M6 will replace it with a hybrid orchestration
   that calls graph traversal in addition.

8. **Reproducible eval dataset.** `evals/datasets/m4-vector-baseline.json`
   ships 40 cases (10 positive, 3 refusals, 1 ACL, 26 mixed factual). Each
   case carries `expectedStatus`, `requiredClaimText`, `forbiddenClaimText`,
   and `expectedEvidenceChunkIds`. The matching `evals/retrieval/corpus.json`
   is the seed corpus used by the M4 unit tests.

9. **In-memory test doubles.** `in-memory.ts` provides
   `InMemoryEmbeddingAdapter` and `InMemoryVectorIndex` so the full M4
   pipeline can run with no network or Docker. This is the M4 unit test
   seam; component tests still use real PostgreSQL via Testcontainers.

## Consequences

- Domain and application stay free of any AI SDK, pg, and Drizzle imports.
- M5 can add a graph strategy to `DefaultVectorQueryService` without
  rewriting the citation or fusion logic.
- M6 can swap the fusion implementation for a hybrid one (e.g. RRF + graph
  expansion) without changing the port surface.
- The 40-case dataset gives reproducible measurements; the same dataset
  will be re-run after M5 and M6 to measure the hybrid improvement.

## Evidence

- `pnpm check` passes (format + lint + typecheck + architecture + 185 unit
  tests).
- Coverage: 94.89% statements, 95.53% lines, 91.78% branches.
- M4 spans: `vector.query`, `vector.search`, `vector.upsertEmbeddings`,
  `vector.createIndexVersion`, `fulltext.search`, `embedding.embedBatch`,
  `rerank.lexical`, `generator.structured` are all created via
  `withSpan(...)` in the infrastructure layer.
- Refusal path: `vector.query` returns `not ok` when no active index exists
  for the tenant (verified by the ACL isolation test).
- Citations: the deterministic `CIT-<index>-<chunkIdPrefix>` form is the
  ground truth for the M4 eval harness.

## Reversal

If a different provider abstraction is required (e.g. an explicit
provider-id registry, or a privacy-aware proxy), only the AI SDK adapters
in `infrastructure/models/` need to change; the ports in
`application/models/ports.ts` and the dataset in `evals/` are stable.
