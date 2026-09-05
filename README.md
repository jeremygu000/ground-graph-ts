# GroundGraph TypeScript

A hybrid Agentic GraphRAG system implementing:
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

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 9.0.0
- Docker and Docker Compose (for local infrastructure)

### Installation

```bash
pnpm install --frozen-lockfile
```

### Local Infrastructure

```bash
docker-compose up -d
```

### Quality Gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit --coverage
pnpm check
```

## Project Structure

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
└── adversarial/      # Security tests
```

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

## Development

### Running Tests

```bash
# Unit tests
pnpm test:unit

# With coverage
pnpm test:unit --coverage

# Architecture tests
pnpm test:architecture

# All tests (requires Docker)
pnpm test:all
```

### Database Migrations

```bash
# Generate migrations
pnpm db:generate

# Run migrations
pnpm db:migrate

# Push schema (development only)
pnpm db:push
```

## License

Apache-2.0
