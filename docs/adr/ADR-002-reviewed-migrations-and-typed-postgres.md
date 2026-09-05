# ADR-002: Reviewed migrations and typed PostgreSQL persistence

## Status

Accepted

## Context

GroundGraph needs a reproducible relational store for documents, chunks, execution state, and outbox events. The schema must evolve predictably, and migration SQL must remain reviewable.

## Decision

- Use Drizzle ORM for schema definition, typed queries, and application-owned transactions.
- Generate migrations with Drizzle Kit, review the generated SQL, and apply reviewed SQL through the migration workflow.
- Keep PostgreSQL authoritative for relational state and outbox rows.

## Consequences

- Migration changes are explicit and reviewable.
- The application keeps transaction boundaries; repositories do not commit independently.
- Runtime mapping remains necessary at database boundaries because schema typing does not replace validation.
