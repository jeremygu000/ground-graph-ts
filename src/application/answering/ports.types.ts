import type { Result } from "../../domain/result";

export interface Claim {
  claimId: string;
  claimText: string;
  citations: Array<{
    evidenceId: string;
    snippet: string;
  }>;
  confidence: number;
}

export interface AnswerGenerationPort {
  generate(params: GenerationParams): Promise<Result<GenerationResponse>>;
}

export interface GenerationParams {
  question: string;
  context: Array<{
    content: string;
    sourceId?: string;
    score?: number;
  }>;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface GenerationResponse {
  answer: string;
  citations: Array<{
    sourceId: string;
    text: string;
    position?: { start: number; end: number };
  }>;
  finishReason: "stop" | "length" | "content_filter" | "error";
}

export interface ClaimValidationPort {
  validateClaim(claim: Claim, context: string[]): Promise<Result<ClaimValidationResult>>;
  validateCitations(claim: Claim): Promise<Result<CitationValidationResult>>;
}

export interface ClaimValidationResult {
  isValid: boolean;
  confidence: number;
  reasons: string[];
}

export interface CitationValidationResult {
  isValid: boolean;
  evidenceExists: boolean;
  citationCorrect: boolean;
}

export interface PolicyPort {
  checkAccess(principalId: string, resourceId: string, action: string): Promise<Result<boolean>>;
  checkClassification(content: string): Promise<Result<ContentClassification>>;
  getAllowedPredicates(principalId: string): Promise<Result<string[]>>;
}

export interface ContentClassification {
  category: "public" | "internal" | "confidential" | "restricted";
  confidence: number;
  labels: string[];
}
