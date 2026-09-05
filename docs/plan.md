# GroundGraph TypeScript Engineering Plan

> Status: Ready for implementation  
> Project type: Standalone TypeScript implementation  
> Python reference: `jeremygu000/ground-graph`  
> Primary language: TypeScript  
> Intended executor: Coding agent working one milestone at a time  
> Last updated: 2026-09-05

## 0. Execution contract

This is the authoritative implementation plan for the TypeScript GroundGraph project. The Python repository supplies product requirements, proven infrastructure ideas, failure lessons, ADR context, and future cross-implementation test cases. It does not block TypeScript delivery.

### 0.1 Working rules

1. Implement M0 through M12 in order, one milestone at a time.
2. Verify prerequisites before starting each milestone.
3. At milestone completion:
   - run every required quality, test, and evaluation gate;
   - update the progress ledger;
   - update README and agent instructions consistently;
   - create/update material ADRs;
   - report exact commands and results;
   - separate verified facts from assumptions.
4. Never claim completion while a required test is skipped, flaky, mocked past the real boundary, or failing.
5. Do not weaken tests, coverage, compiler settings, database constraints, or evaluation thresholds to pass a gate.
6. Domain/application code must not depend on Fastify, Drizzle, PostgreSQL, Neo4j, LangGraph, model SDKs, Testcontainers, or concrete OTel exporters.
7. TypeScript compile-time types do not replace runtime validation at external, database, model, tool, or persisted-event boundaries.
8. PostgreSQL transactions belong to the application Unit of Work; repositories never commit independently.
9. Access control is applied before retrieval results can enter model context.
10. Do not persist hidden chain-of-thought. Persist typed decisions, evidence IDs, scores, safe reason codes, tool outcomes, and configuration versions only.
11. Never log secrets, tokens, credentials, raw unrestricted document content, prompts, model responses, embeddings, or unrestricted graph properties.
12. Do not implement future-milestone work early merely because it is convenient.
13. Use exact/lockfile-resolved dependencies. CI uses `pnpm install --frozen-lockfile`.

### 0.2 Stop and request a decision only when

- required credentials/external access are unavailable;
- a destructive migration could affect non-development data;
- data-classification rules conflict with telemetry/model-provider use;
- requirements are technically incompatible;
- a core architectural replacement is necessary;
- production mutation or materially broader authority would be required.

For ordinary uncertainty, choose the smallest reversible solution consistent with this plan and record it in an ADR.

### 0.3 Progress ledger

Change `[ ]` to `[x]` only after all acceptance criteria pass.

- [x] M0 — Repository and TypeScript engineering baseline
- [x] M1 — Local infrastructure and telemetry foundation
- [x] M2 — Domain contracts and persistence model
- [ ] M3 — Document ingestion and versioning
- [ ] M4 — Vector RAG baseline
- [ ] M5 — Knowledge graph construction
- [ ] M6 — Hybrid GraphRAG retrieval
- [ ] M7 — Query workflow, citations, and API
- [ ] M8 — Evaluation system and CI quality gates
- [ ] M9 — Governance, security, and adversarial testing
- [ ] M10 — Operator and review interfaces
- [ ] M11 — Production hardening and pilot readiness
- [ ] M12 — Post-MVP controlled improvement loop

---

## 1. Product definition

### 1.1 Problem

Ordinary vector RAG retrieves semantically similar text but struggles with relationships across systems, entity ambiguity, multi-hop impact questions, temporal/superseded truth, provenance, authorization, reliable workflow coordination, and diagnosing which stage caused a bad answer.

GroundGraph coordinates:

1. **Vertical knowledge graph** — canonical entities, reified facts, provenance, validity intervals, aliases, and ontology constraints.
2. **Horizontal workflow graph** — bounded ingestion, retrieval, validation, answering, and evaluation steps.
3. **Execution graph** — durable run/step records correlated with OpenTelemetry traces.

### 1.2 Primary outcomes

The system answers questions such as:

- Which services, APIs, queues, or database objects depend on component X?
- What is affected if field Y or endpoint Z changes?
- Which ADR established this behaviour, and what superseded it?
- Which deployment, ticket, code change, and incident are connected?
- What was true at a specified time?
- Which exact immutable sources support each factual statement?

### 1.3 MVP success

- Versioned local documents and selected repositories can be ingested.
- Vector-only, graph-only, and hybrid retrieval run independently and can be compared.
- Factual claims have valid evidence citations or the system refuses/limits the answer.
- Hybrid retrieval measurably improves relational/multi-hop questions over vector-only.
- Every request emits a correlated trace across workflow, dependencies, retrieval, model calls, and validation.
- A versioned golden evaluation dataset runs locally and in CI.
- Security cases produce zero unauthorized retrievals.
- Unanswerable questions are refused rather than completed from model memory.
- Failed executions can be replayed using selected recorded configuration versions.
- Operators/reviewers can inspect evidence, traces, ingestion quality, and review items.

### 1.4 Non-goals for MVP

- General web search.
- Production mutation or autonomous remediation.
- Automatic ontology, prompt, code, tool, or model-routing changes.
- Model fine-tuning or reinforcement learning.
- Uncontrolled multi-agent swarms.
- Enterprise-wide ontology coverage.
- Full RDF/OWL reasoner.
- GPU graph acceleration.
- Kubernetes before local/single-environment deployment is proven.
- Mobile application.
- Mandatory feature parity with Python.

---

## 2. Architecture and technology

### 2.1 Stack

| Concern | Decision |
|---|---|
| Runtime | Repository-pinned active Node.js LTS |
| Language | Strict TypeScript |
| Package manager | pnpm + committed lockfile |
| API | Fastify |
| Runtime validation | Zod |
| PostgreSQL | `pg` + Drizzle ORM stable line |
| Migration | Drizzle Kit generated/reviewed SQL + custom SQL |
| Vector search | pgvector with dimensioned Drizzle `vector` columns |
| Knowledge graph | Official `neo4j-driver` + parameterized Cypher |
| Workflow | `@langchain/langgraph` behind an internal adapter |
| Model/embedding | Vercel AI SDK `ai` + `@ai-sdk/openai` behind ports |
| Object storage | AWS S3 SDK; MinIO locally |
| Telemetry | OpenTelemetry/OTLP + Phoenix |
| Metrics | Prometheus + Grafana |
| Tests | Vitest + Testcontainers Node |
| Evaluation | Deterministic/custom TS evaluators; optional external evaluators behind an adapter |
| Format/lint/type | Prettier + Oxlint + `tsc --noEmit` |
| UI | Next.js after core API/evals stabilize |

Use stable packages only; do not use Drizzle release candidates. Pin the resolved versions in `pnpm-lock.yaml`.

### 2.2 Dependency direction

```text
domain <- application <- workflows/API <- infrastructure composition
```

- Domain may import only standard APIs and Zod.
- Application owns ports, use cases, errors, and transaction boundaries.
- Infrastructure maps Drizzle/Neo4j/model/object-store/OTel types to application/domain types.
- Fastify handlers call application services, never schemas/drivers directly.
- LangGraph composes application services; application code never imports LangGraph types.
- Infrastructure exceptions become typed application errors.

### 2.3 Repository layout

```text
ground-graph/
├── apps/
│   ├── api/
│   ├── ingestion-worker/
│   ├── evaluation-runner/
│   └── web/                         # M10
├── src/
│   ├── domain/{documents,evidence,execution,knowledge,retrieval,evaluation}/
│   ├── application/{ingestion,extraction,resolution,retrieval,answering,evaluation}/
│   ├── workflows/{ingestion,query,evaluation}/
│   └── infrastructure/{postgres,neo4j,models,object-storage,telemetry}/
├── drizzle/{migrations,meta}/
├── ontology/{entity-types,predicates,constraints,versions}/
├── evals/{datasets,metrics,regression,reports}/
├── tests/{unit,architecture,component,contract,stack,e2e,adversarial}/
├── deploy/{docker,otel,prometheus,grafana,phoenix}/
├── docs/{adr,api,operations,evaluation}/
├── docker-compose.yml
├── drizzle.config.ts
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── plan.md
```

### 2.4 Drizzle rules

Use Drizzle for schema, normal CRUD/joins, typed transactions, pgvector columns/indexes, and generated migrations. Use parameterized `sql` templates for `FOR UPDATE SKIP LOCKED`, atomic CTE update/returning, special pgvector operators, and unsupported PostgreSQL expressions.

- Raw string SQL concatenation is prohibited.
- `sql<T>` is not runtime validation; critical rows are mapped/validated.
- Review every generated migration.
- `drizzle-kit push` is prohibited in CI/shared/production-like environments.
- Create pgvector extension in explicit custom SQL before vector tables.
- Drizzle is forward-oriented: require clean bootstrap, repeat/no-op, test reset, and forward-fix evidence; do not pretend it provides Alembic-style automatic down migrations.

### 2.5 Strict TypeScript

Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, and `verbatimModuleSyntax`.

Broad `any`, `as unknown as`, unchecked non-null assertions, and disabled compiler rules are prohibited unless a narrow boundary adapter validates the value and explains the assertion.

---

## 3. Core invariants

### 3.1 Provenance and trust

- Verified facts require authoritative structured provenance or immutable evidence IDs.
- LLM facts default to `candidate` unless explicit predicate policy authorizes verification.
- Reified `Fact` nodes are authoritative.
- Direct entity edges are derived indexes and retain `factId`.
- Evidence always refers to immutable source/document versions.

### 3.2 Temporal truth

Facts support `validFrom`, `validTo`, `observedAt`, `supersededBy`, and source version. Historical truth is preserved. Domain timestamps are normalized UTC ISO-8601 strings ending in `Z`.

### 3.3 Identity, tenancy, authorization

- Canonical IDs are internal branded UUIDs.
- External IDs are source-system and tenant scoped.
- Names/aliases are not unique identity.
- Every retrievable row/node/path has tenant scope.
- ACL filtering occurs inside SQL/Cypher/object queries before results leave repositories.
- Identity/principals come from trusted request context, never client-supplied body fields.

### 3.4 PostgreSQL/Neo4j consistency

PostgreSQL is authoritative for documents, chunks, index/run state, and projection intent. Neo4j is the graph projection store. Store relational state plus outbox event atomically, write Neo4j idempotently, acknowledge only after success, and reconcile projections. Never use an unsafe distributed transaction.

---

## 4. Domain and persistence requirements

### 4.1 Runtime types

Define Zod schemas and inferred types for:

- branded tenant/source/document/version/chunk/index/entity/fact/evidence/run/step/event IDs;
- finite confidence `[0,1]`;
- normalized UTC timestamp;
- recursive JSON: null, boolean, finite number, string, arrays, string-keyed objects;
- `SourceDescriptor`, `ParsedDocument`, `Chunk`, `EvidenceReference`;
- `CanonicalEntity`, `KnowledgeFact`, `EntityMention`;
- `ExecutionRun`, `ExecutionStep`, dependencies;
- `OutboxEvent`;
- retrieval plans, evidence, claims, citations, and query responses;
- evaluation datasets/results.

Recursive JSON rejects NaN/infinity, undefined, bigint, functions, symbols, `Date`, `Map`, `Set`, class instances, non-string keys at boundaries, and cycles.

### 4.2 Knowledge facts

Fact status: `candidate | verified | rejected | superseded`. Extraction: `structured | rule | llm | human`.

- `validTo > validFrom` when both exist.
- `observedAt` is mandatory UTC.
- Verified facts require evidence.
- LLM facts default candidate.
- Facts cannot supersede themselves.
- Subject/object/fact/evidence tenant scopes match.
- Nested entity attributes round-trip without loss.

### 4.3 Execution state

```text
run:  pending -> running -> succeeded | partially_succeeded | failed | cancelled
step: pending -> running -> succeeded | failed | skipped | cancelled
```

Transitions are exhaustive; terminal states cannot transition. Mutable status uses SQL compare-and-set, not read-then-write. Dependencies are same-run, non-self, acyclic. Terminal timestamps match status. Runs store safe version bundles/reason codes, never hidden reasoning.

### 4.4 Unit of Work

Application owns a transaction callback exposing transaction-bound document, execution, and outbox repositories. Repositories flush/execute but do not commit. Unit of Work commits on success and rolls back on failure. Neo4j is never included in the PostgreSQL transaction.

### 4.5 Required M2 tables

- `sources`, `source_sync_state`, `documents`, `document_versions`, `chunks`;
- `index_versions`, `chunk_embeddings`;
- `ingestion_runs`, `ingestion_steps`;
- `execution_runs`, `execution_steps`, `execution_step_dependencies`;
- `outbox_events`;
- later migrations add retrieval, claims, citations, feedback, prompts, model configs, evaluations, and reviews.

Requirements: UUID keys, UTC `timestamptz`, explicit FKs/delete behaviour, tenant on retrievable/mutable aggregates, checks/unique constraints, FK/status/lease/checksum/correlation indexes, immutable versions, and migration-controlled vector dimensions.

`chunk_embeddings` keys include tenant, chunk, and index version. Never expose an arbitrary “first embedding”; retrieval specifies an index version.

### 4.6 Reliable outbox

Status: `pending | claimed | completed | dead_letter`.

Each event includes tenant, aggregate/event type/ID, versioned JSON payload, idempotency key, attempts, available time, claim token/worker/time/lease, completion time, bounded redacted error, and timestamps.

Atomic claim uses deterministic ordering and `FOR UPDATE SKIP LOCKED`, assigns unpredictable token, lease, worker, increments attempts once, and returns stored claimed rows. Completion/failure require matching event/status/token and valid documented lease policy. Retry clears ownership, applies deterministic backoff policy, and dead-letters at maximum attempts.

### 4.7 Neo4j model

```text
(subject:Entity)-[:SUBJECT_OF]->(fact:Fact)-[:OBJECT]->(object:Entity)
(fact)-[:SUPPORTED_BY]->(evidence:EvidenceRef)
```

Use tenant-scoped uniqueness/indexes, parameterized Cypher, explicit write transactions, fully consumed results, deterministic session/driver closure, explicit nested-JSON codec, shared Neo4j temporal mapper, fail-closed unknown-type mapping, and tenant predicates in every query.

---

## 5. Observability

### 5.1 Trace hierarchy

```text
HTTP SERVER
└── workflow/run INTERNAL
    ├── workflow/node INTERNAL
    ├── retrieval INTERNAL
    │   ├── postgres CLIENT
    │   └── neo4j CLIENT
    ├── model CLIENT
    └── validation INTERNAL
```

### 5.2 Safe attributes

Allow bounded operation, result, strategy, repository, question type, fact status, model alias/version, workflow/prompt/ontology/index/dataset versions, retry count, token usage, safe error type, and authorization-applied flags.

Prohibit raw content/questions/prompts/responses/embeddings, credentials/DSNs, principal lists, arbitrary entity attributes, unredacted exception text, and high-cardinality metric labels.

### 5.3 Metrics

- request/workflow/node/retrieval/model/evaluation count and duration;
- active operations;
- dependency readiness gauge;
- outbox claim/batch/retry/dead-letter;
- ingestion throughput/failure/quality;
- retrieval candidates/results/score distribution;
- citation/claim validation;
- model tokens/cost/errors;
- evaluation pass/regression counts.

### 5.4 Lifecycle and tests

App-local providers are injectable. Unit/component tests use in-memory exporters and never connect to localhost OTLP. Shutdown flushes/closes providers. Liveness is excluded; readiness may be traced with real child spans. Unmatched routes use a fixed cardinality label.

Tests assert non-empty metrics, exact parent/child relationships, returned/thrown 5xx paths, excluded endpoints, `1 -> 1 -> 0 -> 1` readiness gauge, injected-secret redaction, no hanging exporter, and exact unique trace arrival in Phoenix.

---

## 6. Testing and quality gates

### 6.1 Layers

- **Unit:** no Docker/network; domain/application/fakes/in-memory OTel.
- **Architecture:** dependency/import/prohibited-boundary rules.
- **Component:** Testcontainers for PostgreSQL/pgvector, Neo4j, MinIO; migrations/adapters/concurrency/rollback.
- **Contract:** public API, provider, persisted event, model structured-output contracts.
- **Stack:** small Compose smoke for full infrastructure/telemetry; no duplicated CRUD matrix.
- **E2E:** source to cited answer, strategy comparisons, temporal/supersession, authorization, replay.
- **Adversarial:** injection, leakage, abuse, malformed content, provider/tool failure.
- **Evaluation:** golden datasets, baselines, calibration, latency/cost/security regressions.

### 6.2 Testcontainers

One container per dependency per session/worker, dynamic URLs/ports, isolated tenants/schemas, cleanup in `finally`, matching Compose image lines. Explicit `pnpm test:component` fails clearly without Docker rather than reporting an empty green suite. No test assumes localhost defaults.

### 6.3 Coverage

Initial gates: lines/statements/functions >= 85%, branches >= 80%. Coverage never replaces migration, concurrency, tenant, security, telemetry, failure, or lifecycle tests. Do not exclude complete source packages.

### 6.4 Commands

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit --coverage
pnpm test:architecture
pnpm test:component
pnpm test:contract
pnpm test:stack
pnpm test:e2e
pnpm test:adversarial
pnpm eval:smoke
pnpm check       # no-Docker deterministic gate
pnpm test:all    # applicable full local suite
```

No required target uses `--passWithNoTests`.

### 6.5 CI

Separate jobs for quality, PostgreSQL component, Neo4j component, MinIO component, contracts, stack telemetry, E2E, security, PR eval smoke, and scheduled full eval. Publish diagnostic/test/eval reports on failure. Live model tests are opt-in locally and run only in controlled CI; ordinary tests use contract-faithful deterministic fakes/recordings.

---

## 7. Milestone plan

## M0 — Repository and TypeScript engineering baseline

**Objective:** strict, reproducible workspace with enforced boundaries.

**Tasks:** Node/pnpm pinning, strict TS, Prettier/Oxlint/Vitest/coverage, settings with production fail-closed validation, errors/result/clock/ID primitives, architecture rules, frozen-lockfile CI, README/contribution/agent instructions, ADR-001.

**Required tests:** configuration branches, production placeholders rejected, architecture violation fixture, real script/coverage wiring, no network/Docker under `pnpm check`.

**Acceptance:** fresh install and `pnpm check` pass; zero TS errors; no broad unsafe assertions; CI matches local; status docs agree.

## M1 — Local infrastructure and telemetry foundation

**Objective:** reproducible seven-service local stack and truthful TypeScript telemetry.

**Tasks:** adapt proven Python Compose for PostgreSQL/pgvector, Neo4j, MinIO, Collector, Phoenix, Prometheus, Grafana; pinned images, loopback bindings, Phoenix DB separation, safe init, limits/health; Fastify health endpoints; OTel providers/metrics/redaction/shutdown; truthful dashboards; ADR telemetry.

**Required tests:** Compose health, real bounded readiness, dependency failure 503/recovery, exact trace in Phoenix, Prometheus queries, Grafana datasource/panels, secret redaction, span parentage, readiness gauge, cleanup.

**Acceptance:** `pnpm check` and stack smoke pass; no false-positive telemetry assertions; outage does not corrupt flow; docs accurate.

## M2 — Domain contracts and persistence model

**Objective:** implement the typed foundation for M3–M7.

**Tasks:** Section 4 contracts; ports/UoW; Drizzle schema/migrations; PostgreSQL repositories; execution CAS; reliable outbox; Neo4j repository; Testcontainers; ADRs for Drizzle/hybrid storage/provenance/versioning.

**Required tests:** recursive/invalid JSON, temporal/provenance/state invariants, migration clean/repeat/reset, schema dimension drift, CRUD/rollback/tenant isolation, real concurrent CAS/outbox workers, token/lease/retry/dead-letter, Neo4j nested JSON/datetime/idempotency/tenant, resource closure; component suite five consecutive runs.

**Acceptance:** public boundaries validated; clean dependency direction; real migrations pass; domain+outbox atomic; no duplicate claim/stale ack; tenant isolation everywhere; no leaks; quality/component gates pass.

## M3 — Document ingestion and versioning

**Objective:** authorized immutable ingestion with resumability and quality reporting.

**Tasks:** filesystem/Markdown/text/HTML/PDF-text/DOCX/EPUB/repository adapters; MinIO; checksum/change detection; parsing/normalization; structure-aware chunks/locators; ACL propagation; parser/chunker/index versions; source deactivation; resumable workflow; TS/Python code parsing first; telemetry/quality report.

**Required tests:** golden fixtures, malformed/empty/scanned input, heading/table/code preservation, idempotency/new version, ACL coverage, deactivation/history, resume without duplication, telemetry privacy, storage cleanup.

**Acceptance:** supported fixtures ingest; unsupported reason codes stable; ACL/provenance metadata 100%; locators resolve; quality report generated; gates pass.

## M4 — Vector RAG baseline

**Objective:** measurable vector+keyword evidence-only baseline.

**Tasks:** provider/embedding/reranker/generator ports; AI SDK OpenAI adapters; Zod structured output/one repair; embedding batch/retry; versioned index; pgvector search with pre-filter ACL; full text; deterministic fusion; citations; telemetry; 30–50 golden cases.

**Required tests:** retry/dimension/version/ACL/filter/fusion/citation/refusal/model-output/privacy; reproducible vector evaluation.

**Acceptance:** vector query E2E; retrieval/answer/citation/latency/cost baseline recorded; factual claims evidenced or refused; immutable baseline ready for M6.

## M5 — Knowledge graph construction

**Objective:** provenance-aware temporal graph from structured/code/text sources.

**Tasks:** versioned ontology; deterministic extractors; LLM structured extraction; mentions/resolution bands; ontology/provenance validation; outbox projection/reconciliation; supersession/deactivation; review queue; labelled datasets/metrics.

**Required tests:** ontology, extractors, malformed model output, LLM candidate rule, provenance, alias/collision/ambiguity, idempotent projection, temporal history, reconciliation, ACL.

**Acceptance:** ontology queryable; searchable fact provenance 100%; ambiguous items reviewed; fact/entity quality gates pass; graph metrics visible.

## M6 — Hybrid GraphRAG retrieval

**Objective:** bounded authorized traversal and measurable improvement over vector baseline.

**Tasks:** query entity resolution; typed retrieval plan; allowlisted Cypher; tenant/principal/status/time filters inside query; provenance hydration; three strategies; deterministic fusion/reranking/diversity/staleness/hub control; budgets; GraphRAG eval cases.

**Required tests:** expected seeds/paths, fact-status/time filters, depth/expansion/time limits, injection, ACL leakage, deterministic fusion, three-way experiment.

**Acceptance:** strategies independently executable; path validity/provenance pass; hybrid improves relational/multi-hop target >=15% or ADR records evidence/remediation; leakage zero; traces explain safe decisions.

## M7 — Query workflow, citations, and API

**Objective:** complete bounded agentic workflow and stable `/v1` API.

**Tasks:** authorization/classification/entity/planning/retrieval/fusion/sufficiency/one retry/generation/claims/citations/policy/persistence services; LangGraph adapter; typed answer/clarify/insufficient/conflict/failure; replay; Fastify/OpenAPI/problem details; workflow/model ADRs.

**Required tests:** every branch/budget, state validation, no validation bypass, unsupported claims, locators, replay versions/non-mutation, API auth/errors, trace hierarchy.

**Acceptance:** representative E2E pass; no unresolved unsupported factual answer; executions inspectable/replayable; API stable; application remains LangGraph-independent.

## M8 — Evaluation system and CI gates

**Objective:** reproducible, stage-specific, enforceable quality.

**Tasks:** versioned JSONL loader; deterministic ingestion/vector/graph/answer/workflow/security metrics; optional external evaluator adapter; versioned judges and human calibration; candidate-baseline experiments; JSON/Markdown/PostgreSQL/Phoenix reports; PR/nightly gates; >=100 golden cases and special datasets; evaluation ADR.

**Initial hard gates:** unauthorized retrievals 0; verified fact provenance 100%; factual-claim citation coverage >=95%; citation correctness >=95%; unsupported factual claims <3%; refusal correctness >=90%; labelled entity resolution >=90%; path validity >=95%; critical regressions 0.

**Required tests:** formulas, datasets/duplicates, reproducibility, evaluator failure isolation, threshold failure, judge calibration, reports, deliberately injected regressions.

**Acceptance:** `pnpm eval:smoke` reliable; nightly full datasets; reports localize regressions; judge not sole gate; baseline reproducible.

## M9 — Governance, security, and adversarial testing

**Objective:** prove authorization, injection resistance, retention/deletion, provider eligibility, and auditability.

**Tasks:** trusted identity context; complete pre-retrieval ACL; classification/provider/retention/deletion; untrusted evidence delimiting and injection risk; tool allowlist/limits; telemetry policy; audit queries; security scanning; adversarial/authorization datasets; threat model/ADR.

**Required tests:** horizontal/vertical escalation, graph inference leak, malicious documents, deletion across stores, redaction, provider denial, rate/size/traversal abuse, safe errors.

**Acceptance:** unauthorized retrieval zero; deletion demonstrated everywhere; secrets absent; content cannot alter policy; runbook/threat model/scans current.

## M10 — Operator and review interfaces

**Objective:** minimum safe query, inspection, review, and operation UI.

**Tasks:** Next.js client; query/citations; evidence/version/locator viewer; safe graph path; trace links; ingestion quality; fact/entity review; evaluation comparison; feedback; authorized backend-only evidence.

**Required tests:** API/UI contracts, roles/tenants, citation navigation, audit trail, accessibility, no raw prompt/secret/reasoning/unauthorized graph detail.

**Acceptance:** pilot users inspect evidence/feedback; reviewers decide with audit trail; operators navigate bad answer to trace/eval; access rules match backend.

## M11 — Production hardening and pilot readiness

**Objective:** controlled pilot with measured capacity, reliability, cost, recovery, and rollback.

**Tasks:** environment/secrets; images/SBOM; target deployment; backup/restore/migration forward-fix; Neo4j rebuild/reconcile; resilience policies; load/soak; measured optimization; fault tests; canary/shadow/rollback; runbooks; release eval/human review.

**Required tests:** load/soak, restore drill, migration recovery, dependency failure/recovery, telemetry outage, ingestion resume, canary rollback, full eval/security.

**Acceptance:** SLOs meet pilot load; recovery demonstrated; cost budgeted; all gates pass; ownership/support/review cadence named.

## M12 — Post-MVP controlled improvement loop

**Objective:** evidence-linked improvement proposals without unsafe autonomous production modification.

**Tasks:** failure clustering; trace/eval-linked proposals for prompt/threshold/routing/chunking/ontology/code; offline evaluation; human approval; local->full eval->shadow->canary->production; records/rollback; drift monitoring.

**Prohibition:** production never automatically changes prompts, ontology, code, tools, routing, or thresholds solely from live feedback.

**Acceptance:** every proposal evidence-linked/reversible; no bypass of evaluation/approval; rollout records queryable; drift creates review work.

---

## 8. Evaluation and reproducibility

### 8.1 Principles

Deterministic checks lead where ground truth exists. Retrieval, graph, answer, workflow, security, latency, and cost remain separate. LLM judges complement human/deterministic evidence, record prompt/model/version/calibration, and never override critical security/provenance/citation gates.

### 8.2 Dataset contract

Each case stores case/dataset version, tenant/principal fixture, question/type/time, expected entities/facts/paths/evidence, required/forbidden claims, answerability/status, and tags. Special sets cover ambiguity, temporal truth, contradiction, multi-hop/impact, injection, authorization, stale index, and dependency failure.

### 8.3 Version bundle

Every answer/evaluation records:

```text
code_commit
workflow_version
prompt_bundle_version
ontology_version
document_index_version
embedding_model_version
reranker_version
generation_model_version
evaluation_dataset_version
judge_version
```

Provider IDs live in versioned aliases/configuration, never scattered through code.

---

## 9. ADR requirements

- ADR-001 — TypeScript, pnpm, Zod, strictness, clean architecture.
- ADR-002 — Drizzle, reviewed migrations, no shared-environment `push`.
- ADR-003 — PostgreSQL/pgvector + Neo4j, reified facts, temporal provenance, outbox.
- ADR-004 — OTel semantics, lifecycle, privacy.
- ADR-005 — document/ontology/prompt/index/workflow/eval versioning.
- ADR-006 — replaceable LangGraph.js workflow adapter.
- ADR-007 — model-provider abstraction and AI SDK OpenAI adapter.
- ADR-008 — evaluation methodology, judge calibration, release gates.
- ADR-009 — pre-retrieval authorization and classification.
- ADR-010 — TypeScript-first delivery and optional promotion to Python.

Every ADR includes context, decision, alternatives, consequences, evidence, and reversal path.

---

## 10. TypeScript-to-Python promotion

TypeScript may complete the entire roadmap without waiting for Python. Promote a capability only after its TypeScript milestone is stable:

1. identify the language-neutral behaviour;
2. link TS tests/evaluation evidence;
3. open a separate Python task/PR;
4. implement idiomatically in Python;
5. run Python gates independently;
6. update shared versioned contracts/assets;
7. never mark Python complete from TS evidence alone.

Good promotion candidates: invariants, database constraints/algorithms, concurrency semantics, API schemas, telemetry conventions, evaluation datasets/results, and security policies. Do not force identical ORM, migration, workflow, parser, or testing internals.

---

## 11. Definition of Done

A feature is done only when boundaries are respected; boundaries are runtime validated; happy/failure/concurrency/security paths are tested; DB changes have reviewed migrations; tenant scope is enforced; transactions are correct; telemetry is useful/private; resources close; behaviour changes have evaluation evidence; docs/ADRs are updated; all applicable gates pass; and risky change recovery is documented.

A milestone is done only when every acceptance criterion passes and the progress ledger is updated.

---

## 12. First vertical slices

```text
one document
-> parsed immutable chunks
-> authorized vector retrieval
-> evidence-only answer
-> valid citation
-> complete trace
-> deterministic evaluation case
```

```text
two related entities
-> provenance-backed temporal fact
-> authorized constrained graph path
-> hybrid answer
-> vector-versus-hybrid evaluation
```

Do not start with chat UI, a large ontology, a broad parser catalogue, or a complex agent swarm.

---

## 13. Coding-agent handoff format

At every session end report:

1. milestone/tasks completed;
2. files/schema/migrations changed;
3. ADR decisions;
4. exact commands/results;
5. skipped tests and reason;
6. evaluation change versus baseline where applicable;
7. resource-lifecycle evidence;
8. known limitations/failures;
9. improvements that may later benefit Python;
10. next smallest authorized task.

Never claim completion solely because files were generated.
