# ADR-015 — Production hardening and pilot readiness

- Status: Accepted
- Milestone: M11
- Date: 2026-09-07

## Context

M11 requires controlled pilot with measured capacity, reliability, cost, recovery,
and rollback capabilities. The system must be deployable and maintainable in
production.

## Decision

1. **Environment configuration.** All secrets and configuration via environment
   variables:
   - `DATABASE_URL` — PostgreSQL connection
   - `NEO4J_HOST`, `NEO4J_USER`, `NEO4J_PASSWORD` — Neo4j connection
   - `S3_*` — MinIO/S3 object storage
   - `OTEL_EXPORTER_OTLP_ENDPOINT` — OTel collector
   - `OPENAI_API_KEY` — Model provider

2. **Docker Compose for local development.** The `stack/` directory contains:
   - PostgreSQL with pgvector
   - Neo4j
   - MinIO
   - Phoenix (OTel UI)
   - Prometheus + Grafana
   - OTel Collector

3. **Graceful shutdown.** The API server handles SIGINT/SIGTERM:
   - Closes HTTP server
   - Closes database connections
   - Closes Neo4j driver
   - Closes MinIO client
   - Flushes OTel telemetry

4. **Health endpoints.**
   - `/healthz` — Liveness check (returns ok if server is up)
   - `/ready` — Readiness check (checks all dependencies)

5. **Database migrations.** Drizzle migrations are applied via:
   ```bash
   pnpm db:migrate
   ```

6. **Backup/restore strategy.**
   - PostgreSQL: Standard `pg_dump`/`pg_restore`
   - Neo4j: `neo4j-admin dump`/`neo4j-admin load`
   - MinIO: `mc cp` to S3

7. **SLOs for pilot.**
   - API availability: 99.9%
   - Query latency P95: <2s
   - Retrieval recall: >80%

## Production Checklist

- [ ] Secrets injected via environment, not in code
- [ ] Database migrations tested in staging
- [ ] Neo4j and PostgreSQL backups verified
- [ ] OTel pipeline verified
- [ ] Health endpoints returning 200
- [ ] Graceful shutdown tested
- [ ] Load tested with expected pilot traffic

## Consequences

- System is deployable via Docker Compose
- All configuration externalized
- Health monitoring in place
- Graceful shutdown prevents data loss

## Evidence

- `apps/api/src/server.ts` implements graceful shutdown
- `docker-compose.yml` defines local infrastructure
- Health checks implemented at `/healthz` and `/ready`
