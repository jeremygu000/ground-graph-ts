# GroundGraph TypeScript - Agent Instructions

## Project Overview

GroundGraph TypeScript is a hybrid Agentic GraphRAG system implementing:
- **Vertical knowledge graph** — canonical entities, reified facts, provenance, validity intervals
- **Horizontal workflow graph** — bounded ingestion, retrieval, validation, answering, evaluation steps
- **Execution graph** — durable run/step records correlated with OpenTelemetry traces

## Technology Stack

| Concern | Technology |
|---------|------------|
| Runtime | Node.js LTS (>=22) |
| Language | Strict TypeScript |
| Package Manager | pnpm (frozen lockfile) |
| API | Fastify |
| Runtime Validation | Zod |
| PostgreSQL | pg + Drizzle ORM |
| Vector Search | pgvector |
| Knowledge Graph | Neo4j |
| Workflow | LangGraph (behind adapter) |
| Model/Embedding | Vercel AI SDK + @ai-sdk/openai |
| Object Storage | AWS S3 SDK / MinIO |
| Telemetry | OpenTelemetry/OTLP + Phoenix |
| Metrics | Prometheus + Grafana |
| Tests | Vitest + Testcontainers |

## Architecture

```
domain <- application <- workflows/API <- infrastructure composition
```

### Layer Rules

1. **Domain** (`src/domain/`): May import only standard APIs and Zod
2. **Application** (`src/application/`): Owns ports, use cases, errors, transaction boundaries
3. **Workflows** (`src/workflows/`): Uses application services via LangGraph adapter
4. **Infrastructure** (`src/infrastructure/`): Implements application ports

## Milestone Progress

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

## Quality Gates

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit --coverage
pnpm check
```

## Critical Rules

1. Never commit secrets, tokens, credentials, raw unrestricted document content, prompts, model responses, embeddings
2. Domain/application code must not depend on Fastify, Drizzle, PostgreSQL, Neo4j, LangGraph, model SDKs, Testcontainers
3. TypeScript compile-time types do not replace runtime validation at external boundaries
4. PostgreSQL transactions belong to the application Unit of Work; repositories never commit independently
5. Access control is applied before retrieval results can enter model context
6. Do not persist hidden chain-of-thought; persist typed decisions, evidence IDs, scores only

## Directory Structure

```
src/
├── domain/          # Core domain logic (primitives, errors, result, types)
├── application/     # Use cases, ports, transaction boundaries
├── workflows/       # LangGraph workflows
└── infrastructure/  # Adapters (postgres, neo4j, models, etc.)

apps/
├── api/             # Fastify API
├── ingestion-worker/ # Document ingestion worker
└── evaluation-runner/

tests/
├── unit/            # No Docker/network
├── architecture/    # Boundary rules
├── component/       # Testcontainers
├── contract/        # API contracts
├── stack/           # Full stack smoke
├── e2e/             # End-to-end
└── adversarial/     # Security tests
```

## Development Workflow

1. Check current milestone in `docs/plan.md`
2. Implement one milestone at a time
3. Run quality gates after each change
4. Update progress ledger in `docs/plan.md`
5. Create/update ADRs in `docs/adr/`

## ADR Requirements

Key architecture decisions must be documented in ADRs:
- ADR-001: TypeScript, pnpm, Zod, strictness, clean architecture
- ADR-002: Drizzle, reviewed migrations
- ADR-003: PostgreSQL/pgvector + Neo4j, reified facts
- ADR-004: OTel semantics, lifecycle, privacy
- ADR-005: Versioning strategy
- ADR-006: LangGraph adapter
- ADR-007: Model provider abstraction
- ADR-008: Evaluation methodology
- ADR-009: Pre-retrieval authorization
- ADR-010: TypeScript-first delivery

## Reference Project

Python reference: `~/Desktop/projects/ground-graph`

Good promotion candidates: invariants, database constraints, concurrency semantics, API schemas, telemetry conventions, evaluation datasets.
