export interface IngestionQualityReport {
  documentId: string;
  versionId: string;
  sourceUri: string;
  qualityMetrics: {
    totalChunks: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
    emptyChunks: number;
    duplicateChunks: number;
    parsingErrors: number;
  };
  ingestedAt: string;
  ingestedBy: string;
}
