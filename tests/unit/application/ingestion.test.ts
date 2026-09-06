import { describe, expect, it } from "vitest";
import {
  IngestDocumentRequestSchema,
  IngestDocumentResponseSchema,
} from "../../../src/application/ingestion/ingestion.schema";

describe("application ingestion types", () => {
  it("validates ingest document requests", () => {
    const request = IngestDocumentRequestSchema.parse({
      sourceUri: "https://example.com/doc",
      sourceType: "url",
      tenantId: crypto.randomUUID(),
      principalId: crypto.randomUUID(),
      metadata: { nested: { ok: true } },
    });

    expect(request.chunkingStrategy).toBe("heading");
    expect(request.maxChunkSize).toBe(1000);
    expect(request.chunkOverlap).toBe(200);
  });

  it("validates ingest document responses", () => {
    const response = IngestDocumentResponseSchema.parse({
      documentId: crypto.randomUUID(),
      versionId: crypto.randomUUID(),
      chunksCreated: 3,
      status: "completed",
      errors: [
        {
          stage: "parse",
          message: "warning",
        },
      ],
    });

    expect(response.status).toBe("completed");
  });
});
