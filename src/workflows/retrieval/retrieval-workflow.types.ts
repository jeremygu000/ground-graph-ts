export interface RetrievalWorkflowInput {
  question: string;
  tenantId: string;
  principalId: string;
  strategy: "vector" | "graph" | "hybrid" | "fulltext";
  filters?: {
    documentIds?: string[];
    entityTypes?: string[];
    factStatuses?: Array<"candidate" | "verified" | "rejected" | "superseded">;
    timeRange?: {
      validFrom?: string;
      validTo?: string;
    };
  };
  maxResults?: number;
  maxHops?: number;
  budgets?: {
    vectorResults?: number;
    graphResults?: number;
    fusionRatio?: number;
  };
  traceId?: string;
}

export interface RetrievalWorkflowResult {
  queryId: string;
  answer: string;
  status: "answered" | "insufficient_evidence" | "refused" | "clarification_needed";
  claims: Array<{
    claimId: string;
    claimText: string;
    citations: Array<{
      evidenceId: string;
      snippet: string;
    }>;
    confidence: number;
  }>;
  strategiesUsed: Array<"vector" | "graph" | "hybrid" | "fulltext">;
  fusionTrace: Array<{
    strategy: string;
    inputs: number;
    fused: number;
    weight: number;
  }>;
  timingMs: {
    entityResolution: number;
    retrieval: number;
    generation: number;
    total: number;
  };
  traceId?: string;
}
