import type {
  SourceDescriptor,
  ParsedDocument,
  Chunk,
} from "../../domain/documents/documents.schema";
import type { Result } from "../../domain/result";
import type { IndexVersionInfo } from "../models/ports";

export interface SourceRepository {
  create(
    descriptor: SourceDescriptor,
    tenantId: string,
    principalId: string,
  ): Promise<Result<Source>>;
  findById(id: string, tenantId: string): Promise<Result<Source | null>>;
  findByUri(uri: string, tenantId: string, principalId: string): Promise<Result<Source | null>>;
  update(id: string, tenantId: string, updates: Partial<Source>): Promise<Result<Source>>;
  deactivate(id: string, tenantId: string): Promise<Result<void>>;
  list(tenantId: string, limit?: number, offset?: number): Promise<Result<Source[]>>;
}

export interface Source {
  id: string;
  tenantId: string;
  principalId: string;
  type: SourceDescriptor["type"];
  uri: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  lastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionRepository {
  create(documentId: string, version: CreateDocumentVersionInput): Promise<Result<DocumentVersion>>;
  findById(id: string, tenantId: string): Promise<Result<DocumentVersion | null>>;
  findLatest(documentId: string, tenantId: string): Promise<Result<DocumentVersion | null>>;
  listByDocument(documentId: string, tenantId: string): Promise<Result<DocumentVersion[]>>;
  deactivate(id: string, tenantId: string): Promise<Result<void>>;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  tenantId: string;
  principalId: string;
  versionNumber: number;
  contentHash: string;
  checksum: string;
  sizeBytes: number;
  parsedDocument?: ParsedDocument;
  isActive: boolean;
  createdAt: string;
  createdBy?: string;
}

export interface DocumentRepository {
  create(
    document: CreateDocumentInput,
    tenantId: string,
    principalId: string,
  ): Promise<Result<Document>>;
  findById(id: string, tenantId: string): Promise<Result<Document | null>>;
  findBySourceId(sourceId: string, tenantId: string): Promise<Result<Document | null>>;
  update(id: string, tenantId: string, updates: Partial<Document>): Promise<Result<Document>>;
  list(tenantId: string, limit?: number, offset?: number): Promise<Result<Document[]>>;
}

export interface Document {
  id: string;
  tenantId: string;
  principalId: string;
  sourceId: string;
  title?: string;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkRepository {
  create(chunk: CreateChunkInput, tenantId: string): Promise<Result<Chunk>>;
  createMany(chunks: CreateChunkInput[], tenantId: string): Promise<Result<Chunk[]>>;
  findById(id: string, tenantId: string): Promise<Result<Chunk | null>>;
  findByDocumentVersion(documentVersionId: string, tenantId: string): Promise<Result<Chunk[]>>;
  findByIds(ids: string[], tenantId: string): Promise<Result<Chunk[]>>;
}

export interface SourceSyncStateRepository {
  create(state: SourceSyncState): Promise<Result<SourceSyncState>>;
  findBySourceId(sourceId: string, tenantId: string): Promise<Result<SourceSyncState | null>>;
  update(
    sourceId: string,
    tenantId: string,
    updates: Partial<SourceSyncState>,
  ): Promise<Result<SourceSyncState>>;
}

export interface SourceSyncState {
  id: string;
  sourceId: string;
  tenantId: string;
  lastCursor?: string;
  lastSyncedAt?: string;
  lastChangeHash?: string;
  syncStatus: "idle" | "syncing" | "error";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentInput {
  sourceId: string;
  principalId: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateDocumentVersionInput {
  id?: string;
  tenantId: string;
  principalId: string;
  versionNumber: number;
  contentHash: string;
  checksum: string;
  sizeBytes: number;
  parsedDocument?: ParsedDocument;
  isActive: boolean;
  createdBy?: string;
}

export type CreateChunkInput = Omit<Chunk, "id">;

export interface VectorIndexRepository {
  activateIndexVersion(
    info: Omit<IndexVersionInfo, "indexVersionId">,
  ): Promise<Result<IndexVersionInfo>>;
  getActiveIndexVersion(tenantId: string): Promise<Result<IndexVersionInfo | null>>;
}
