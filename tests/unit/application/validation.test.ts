import { describe, expect, it } from "vitest";
import { ParsedDocumentSchema } from "../../../src/domain/documents/types";
import {
  ChunkSchema,
  DocumentSchema,
  DocumentVersionSchema,
  OutboxEventSchema,
  SourceSchema,
  mapToChunk,
  mapToDocumentVersion,
  mapToOutboxEvent,
  mapToSource,
} from "../../../src/application/validation";

describe("application validation mappers", () => {
  it("maps source rows with nullish optional values", () => {
    const source = mapToSource({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      type: "url",
      uri: "https://example.com",
      mimeType: null,
      metadata: { nested: { ok: true } },
      isActive: 1,
      lastSyncedAt: new Date("2024-01-15T10:30:00.000Z"),
      createdAt: new Date("2024-01-15T10:30:00.000Z"),
      updatedAt: "2024-01-15T10:31:00.000Z",
    });

    expect(SourceSchema.parse(source)).toEqual({
      ...source,
      lastSyncedAt: "2024-01-15T10:30:00.000Z",
      createdAt: "2024-01-15T10:30:00.000Z",
      updatedAt: "2024-01-15T10:31:00.000Z",
    });
  });

  it("maps document version rows with parsed documents", () => {
    const parsedDocument = ParsedDocumentSchema.parse({
      sourceId: crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      title: "Doc",
      content: "content",
      metadata: { kind: "fixture" },
      extractedAt: "2024-01-15T10:30:00.000Z",
    });

    const version = mapToDocumentVersion({
      id: crypto.randomUUID(),
      documentId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      versionNumber: "2",
      contentHash: "hash",
      checksum: "checksum",
      sizeBytes: "42",
      parsedDocument,
      isActive: false,
      createdAt: new Date("2024-01-15T10:30:00.000Z"),
      createdBy: crypto.randomUUID(),
    });

    expect(DocumentVersionSchema.parse(version)).toEqual(version);
  });

  it("maps chunk rows and preserves metadata", () => {
    const chunk = mapToChunk({
      id: crypto.randomUUID(),
      documentVersionId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      sequenceNumber: "3",
      content: "chunk",
      contentHash: "hash",
      locator: { type: "heading", path: "intro", startLine: 1, endLine: 3 },
      metadata: { nested: { ok: true } },
      createdAt: new Date("2024-01-15T10:30:00.000Z"),
    });

    expect(ChunkSchema.parse(chunk)).toEqual(chunk);
  });

  it("maps outbox rows with optional timestamps", () => {
    const outbox = mapToOutboxEvent({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { nested: { ok: true } },
      idempotencyKey: "key",
      status: "claimed",
      attempts: "2",
      availableAt: new Date("2024-01-15T10:30:00.000Z"),
      claimedAt: new Date("2024-01-15T10:31:00.000Z"),
      claimedBy: "worker-a",
      leaseToken: "lease",
      completedAt: null,
      deadLetteredAt: undefined,
      error: "boom",
      createdAt: new Date("2024-01-15T10:32:00.000Z"),
      updatedAt: new Date("2024-01-15T10:33:00.000Z"),
    });

    expect(OutboxEventSchema.parse(outbox)).toEqual(outbox);
  });

  it("rejects invalid schema values at the boundary", () => {
    expect(SourceSchema.safeParse({ uri: "not-a-url" }).success).toBe(false);
    expect(DocumentSchema.safeParse({ id: crypto.randomUUID() }).success).toBe(false);
  });
});
