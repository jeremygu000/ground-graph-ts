import { z } from "zod";
import { validateOrThrow } from "../domain/validation";
import {
  ChunkSchema,
  ParsedDocumentSchema,
  SourceTypeSchema,
} from "../domain/documents/documents.schema";
import {
  ChunkSchema as ApplicationChunkSchema,
  DocumentSchema,
  DocumentVersionSchema,
  OutboxEventSchema,
  SourceSchema,
} from "./validation.schema";
import type { Document, DocumentVersion } from "./ingestion/ports.types";

function toISOString(val: unknown): string {
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "string") return val;
  if (val === null || val === undefined) return "";
  return String(val);
}

function nullableString(val: unknown): string | null | undefined {
  if (val === null) return null;
  if (val === undefined) return undefined;
  return toISOString(val);
}

function undefinedIfNull<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

export function mapToSource(row: Record<string, unknown>): z.infer<typeof SourceSchema> {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    principalId: String(row.principalId),
    type: row.type as z.infer<typeof SourceTypeSchema>,
    uri: String(row.uri),
    mimeType: undefinedIfNull(row.mimeType as string | null | undefined),
    metadata: undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined),
    isActive: Boolean(row.isActive),
    lastSyncedAt: nullableString(row.lastSyncedAt) ?? undefined,
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };
}

export function mapToDocument(row: Record<string, unknown>): Document {
  const result = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    principalId: String(row.principalId),
    sourceId: String(row.sourceId),
    title: undefinedIfNull(row.title as string | null | undefined),
    metadata: undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined),
    isActive: Boolean(row.isActive),
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };
  return validateOrThrow(DocumentSchema, result, "Document") as Document;
}

export function mapToDocumentVersion(row: Record<string, unknown>): DocumentVersion {
  const result: z.input<typeof DocumentVersionSchema> = {
    id: String(row.id),
    documentId: String(row.documentId),
    tenantId: String(row.tenantId),
    principalId: String(row.principalId),
    versionNumber: Number(row.versionNumber),
    contentHash: String(row.contentHash),
    checksum: String(row.checksum),
    sizeBytes: Number(row.sizeBytes),
    parsedDocument:
      row.parsedDocument === null || row.parsedDocument === undefined
        ? undefined
        : (row.parsedDocument as z.input<typeof ParsedDocumentSchema>),
    isActive: Boolean(row.isActive),
    createdAt: toISOString(row.createdAt),
  };
  if (row.createdBy != null) result.createdBy = String(row.createdBy);
  return validateOrThrow(DocumentVersionSchema, result, "DocumentVersion") as DocumentVersion;
}

export function mapToChunk(row: Record<string, unknown>) {
  const result = {
    id: String(row.id),
    documentVersionId: String(row.documentVersionId),
    principalId: String(row.principalId),
    tenantId: String(row.tenantId),
    sequenceNumber: Number(row.sequenceNumber),
    content: String(row.content),
    contentHash: String(row.contentHash),
    locator: row.locator as z.infer<typeof ChunkSchema>["locator"],
    metadata: undefinedIfNull(row.metadata as Record<string, unknown> | null | undefined),
    createdAt: toISOString(row.createdAt),
  };
  return validateOrThrow(ApplicationChunkSchema, result, "Chunk");
}

export function mapToOutboxEvent(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    id: String(row.id),
    tenantId: String(row.tenantId),
    aggregateType: String(row.aggregateType),
    aggregateId: String(row.aggregateId),
    eventType: String(row.eventType),
    payload: row.payload as Record<string, unknown>,
    idempotencyKey: String(row.idempotencyKey),
    status: String(row.status),
    attempts: Number(row.attempts),
    availableAt: toISOString(row.availableAt),
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
  };
  if (row.claimedAt != null) result.claimedAt = toISOString(row.claimedAt);
  if (row.claimedBy != null) result.claimedBy = String(row.claimedBy);
  if (row.leaseToken != null) result.leaseToken = String(row.leaseToken);
  if (row.completedAt != null) result.completedAt = toISOString(row.completedAt);
  if (row.deadLetteredAt != null) result.deadLetteredAt = toISOString(row.deadLetteredAt);
  if (row.error != null) result.error = String(row.error);
  return validateOrThrow(OutboxEventSchema, result, "OutboxEvent");
}
