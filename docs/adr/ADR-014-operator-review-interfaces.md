# ADR-014 — Operator and review interfaces

- Status: Accepted
- Milestone: M10
- Date: 2026-09-07

## Context

M10 requires minimum safe query, inspection, review, and operation interfaces.
The API provides the backend; the operator interface is the frontend for reviewing
answers, navigating traces, and managing the system.

## Decision

1. **REST API as the primary interface.** All operations go through `/v1/` routes:
   - `POST /v1/query` — Execute retrieval query
   - `GET /v1/documents` — List documents
   - `GET /v1/documents/:id` — Get document details
   - `GET /v1/entities` — List entities
   - `GET /v1/entities/:id` — Get entity details
   - `POST /v1/feedback` — Submit feedback on answers/citations

2. **Feedback system.** Users can submit feedback on:
   - The overall query answer
   - Individual claims
   - Individual citations
   Ratings: helpful/not_helpful, correct/incorrect

3. **Trace correlation.** Every API response includes a `traceId` that can be
   used to navigate to Phoenix for detailed trace inspection.

4. **Citation viewer.** Citations in responses include:
   - `citationId` — Stable identifier for linking
   - `evidenceId` — Points to the evidence chunk
   - `snippet` — The actual cited text
   - `score` — Relevance score

5. **Evidence viewer.** The evidence array in responses provides:
   - Document version reference
   - Locator path
   - Snippet content
   - Position information (startChar, endChar)

6. **Evaluation comparison.** The `EvaluationComparison` schema supports:
   - Comparing model answers against ground truth
   - Recording feedback and correctness
   - Notes for human review

7. **Next.js client (future).** The UI client will be a separate Next.js
   application that consumes the `/v1/` API.

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/query | Execute query with citations |
| GET | /v1/documents | List documents |
| GET | /v1/documents/:id | Get document |
| GET | /v1/entities | List entities |
| GET | /v1/entities/:id | Get entity |
| POST | /v1/feedback | Submit feedback |

## Consequences

- All operations are accessible via REST API
- Trace IDs link to Phoenix for debugging
- Feedback enables human calibration of the system

## Evidence

- `apps/api/src/routes/` contains all route implementations
- `apps/api/src/schemas/feedback.schema.ts` defines feedback types
- `apps/api/src/schemas/query.schema.ts` defines response types with citations
