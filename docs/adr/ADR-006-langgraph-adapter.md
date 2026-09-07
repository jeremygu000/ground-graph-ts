# ADR-006: LangGraph Adapter Pattern

## Status
Accepted

## Context

GroundGraph uses a clean architecture with these layers:
- **Domain**: Pure business logic, no external dependencies
- **Application**: Use cases, ports, DTOs, validation
- **Workflows**: Orchestration via LangGraph
- **Infrastructure**: External adapters (PostgreSQL, Neo4j, models, storage)

The application layer must remain **LangGraph-independent** to:
1. Keep the core business logic testable without LangGraph
2. Allow alternative workflow engines in the future
3. Maintain clear architectural boundaries

## Decision

### LangGraph lives in the Workflows layer

LangGraph is used exclusively in the `src/workflows/` directory. The application layer defines **port interfaces** that workflows implement. No LangGraph types leak into `src/application/`.

### Adapter Pattern

```
API Route → Workflow (implements Application Port) → Infrastructure Adapters
                ↑
                |
          LangGraph Node
```

### State Interface

Workflow state is defined as plain TypeScript interfaces, not LangGraph StateGraph:

```typescript
// src/application/retrieval/workflow.types.ts
export interface RetrievalWorkflowState {
  input: RetrievalWorkflowInput;
  status: "pending" | "classifying" | "planning" | "retrieving" | "generating" | "done" | "failed";
  result?: RetrievalWorkflowResult;
  error?: string;
}
```

### Nodes are Plain Classes

Each workflow node is a plain TypeScript class with a `process(state)` method. The LangGraph adapter composes these into a graph.

```typescript
// Infrastructure node (implements application port)
class RetrievalNode {
  constructor(
    private readonly hybridQuery: HybridQueryPort,
    private readonly citationBuilder: CitationBuilderPort,
  ) {}

  async process(state: RetrievalWorkflowState): Promise<Partial<RetrievalWorkflowState>> {
    // ...
  }
}
```

### Replay Support

Workflow executions are persisted via the execution graph (OpenTelemetry traces + PostgreSQL execution records). Replay re-runs the same state machine with the same inputs.

## Consequences

**Positive:**
- Application layer remains testable without LangGraph
- Nodes are independently testable
- Workflow can switch LangGraph version without touching application
- Replay works via standard execution records

**Negative:**
- Additional abstraction indirection
- LangGraph features (checkpointer, memory) require adapter code

## References

- LangGraph documentation: https://langchain-ai.github.io/langgraph/
- ADR-004: OTel semantics and lifecycle
