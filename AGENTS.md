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

### File Organization Rules

Keep each module organized by responsibility. These conventions are mandatory for new code and should be applied when modifying existing modules:

1. `*.types.ts` contains public TypeScript interfaces, type aliases, port contracts, and configuration contracts. It must not contain runtime code.
2. `*.schema.ts` contains Zod schemas and types directly inferred from those schemas. It must not contain database row mapping or unrelated business logic.
3. `*.mapper.ts` contains conversions from database/driver/external representations into validated domain or application values. Mappers must perform runtime validation at the boundary.
4. `*.utils.ts` contains small, deterministic, side-effect-free helpers with a cohesive purpose. Do not use a generic `utils.ts` for unrelated functionality.
5. Implementation files contain one cohesive service, adapter, workflow, or domain operation. Do not mix unrelated interfaces, schemas, and implementation logic in the same file.
6. `index.ts` files are public module entrypoints and may re-export symbols from sibling modules. Non-index implementation files must import types directly and must not re-export them.
7. Use semantic names for implementation files, such as `structured-code-extractor.ts`, `validation.mapper.ts`, or `ingestion-workflow.ts`; avoid catch-all files when a module has multiple independent responsibilities.
8. Schema-derived types may remain beside their Zod schema because the schema is their single source of truth. Domain primitives such as `Result` and branded IDs may keep their tightly coupled constructors beside the type definitions.
9. Pure type files are excluded from coverage; runtime schemas, mappers, adapters, services, and workflows are not excluded merely because they are difficult to cover.

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
├── domain/          # Core domain logic, primitives, errors, results, schemas
├── application/     # Use cases, ports, schemas, mappers, transaction boundaries
├── workflows/       # LangGraph workflows and workflow-specific types
└── infrastructure/  # Adapters (postgres, neo4j, models, telemetry, storage)

# Typical module layout
<module>/
├── <feature>.types.ts       # interfaces and type aliases
├── <feature>.schema.ts      # runtime Zod schemas
├── <feature>.mapper.ts      # validated external/DB mapping
├── <feature>.utils.ts       # cohesive pure helpers, when needed
├── <feature>.ts             # service/adapter implementation
└── index.ts                 # public re-export surface only

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
6. Before finishing a refactor, run `rg` to verify that public declarations are not left in implementation files and run `pnpm check`.

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
