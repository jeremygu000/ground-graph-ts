export interface InMemoryVectorIndexEntry {
  tenantId?: string;
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
  metadata: Record<string, unknown>;
  embedding: number[];
  indexVersionId: string;
  embeddingModel: string;
  dimension: number;
}
