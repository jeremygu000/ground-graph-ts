import type { IngestionQualityReport } from "../../application/ingestion/ingestion.types";

export interface IngestionWorkflowInput {
  sourceUri: string;
  sourceType: "file" | "url" | "git" | "api" | "s3";
  mimeType?: string;
  metadata?: Record<string, unknown>;
  tenantId: string;
  principalId: string;
  userId?: string;
  chunkingStrategy?: "heading" | "recursive" | "page" | "semantic";
  maxChunkSize?: number;
  chunkOverlap?: number;
}

export interface IngestionWorkflowResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
  status: "created" | "updated" | "unchanged";
  chunksCreated: number;
  qualityReport: IngestionQualityReport;
}
