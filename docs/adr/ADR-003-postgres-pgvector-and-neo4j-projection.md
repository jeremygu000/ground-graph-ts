# ADR-003: PostgreSQL plus pgvector, with Neo4j as a graph projection store

## Status

Accepted

## Context

GroundGraph needs both relational/queryable document state and graph traversal over canonical entities and reified facts.

## Decision

- Store authoritative relational data in PostgreSQL.
- Use pgvector for embedding search in the relational store.
- Project canonical entities and facts into Neo4j for graph traversal and path finding.
- Keep projection writes idempotent and tenant-scoped.

## Consequences

- PostgreSQL remains the source of truth for document and execution state.
- Neo4j is a projection layer, not the system of record.
- Cross-store consistency relies on application orchestration, outbox-style replay, and idempotent graph writes.
