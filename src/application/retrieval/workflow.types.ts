export type QueryStrategy = "vector" | "graph" | "hybrid" | "fulltext";

export interface RetrievalQueryFilters {
  documentIds?: string[];
  entityTypes?: string[];
  factStatuses?: Array<"candidate" | "verified" | "rejected" | "superseded">;
  timeRange?: {
    validFrom?: string;
    validTo?: string;
  };
}

export interface RetrievalQueryBudgets {
  vectorResults?: number;
  graphResults?: number;
  fusionRatio?: number;
}

export interface RetrievalWorkflowInput {
  question: string;
  tenantId: string;
  principalId: string;
  strategy: QueryStrategy;
  filters?: RetrievalQueryFilters;
  maxResults?: number;
  maxHops?: number;
  budgets?: RetrievalQueryBudgets;
  traceId?: string;
}

export interface Citation {
  citationId: string;
  evidenceId: string;
  snippet: string;
  score: number;
}

export interface Claim {
  claimId: string;
  claimText: string;
  citations: Citation[];
  confidence: number;
}

export interface FusionTraceEntry {
  strategy: string;
  inputs: number;
  fused: number;
  weight: number;
}

export interface RetrievalWorkflowTiming {
  entityResolution: number;
  retrieval: number;
  generation: number;
  total: number;
}

export type RetrievalWorkflowStatus =
  | "answered"
  | "insufficient_evidence"
  | "refused"
  | "clarification_needed";

export interface RetrievalWorkflowResult {
  queryId: string;
  answer: string;
  status: RetrievalWorkflowStatus;
  claims: Claim[];
  strategiesUsed: QueryStrategy[];
  fusionTrace: FusionTraceEntry[];
  timingMs: RetrievalWorkflowTiming;
  traceId?: string;
}

export interface RetrievalWorkflow {
  execute(input: RetrievalWorkflowInput): Promise<RetrievalWorkflowResult>;
}
