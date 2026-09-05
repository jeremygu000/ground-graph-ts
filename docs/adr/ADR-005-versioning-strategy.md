# ADR-005: Versioning strategy for documents, projections, and runs

## Status

Accepted

## Context

The system must answer historical questions, replay failed work, and compare results across model or workflow changes.

## Decision

- Version source documents, parsed documents, chunks, execution runs, workflow bundles, and evaluation datasets.
- Preserve temporal truth on facts with validity intervals and observation timestamps.
- Persist immutable evidence IDs and provenance references alongside derived projections.

## Consequences

- Answers can be tied back to the exact source and workflow version that produced them.
- Historical state remains queryable without overwriting prior truth.
- Replay and evaluation can use recorded configuration versions instead of ambient defaults.
