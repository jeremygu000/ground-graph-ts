import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Chunker } from "../../../src/application/ingestion/chunker-port";
import type { ContentFetcher } from "../../../src/application/ingestion/content-fetcher-port";
import type { DocumentParser, ParsedContent } from "../../../src/application/ingestion/parser-port";
import type { UnitOfWorkFactory } from "../../../src/application/unit-of-work";
import { IngestionWorkflow } from "../../../src/workflows/ingestion/ingestion-workflow";

type UnitOfWorkOverrides = {
  sourceRepository?: Record<string, unknown>;
  documentRepository?: Record<string, unknown>;
  documentVersionRepository?: Record<string, unknown>;
  chunkRepository?: Record<string, unknown>;
};

function createUnitOfWork(overrides: UnitOfWorkOverrides = {}): any {
  const sourceRepository: any = {
    findByUri: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    list: vi.fn(),
    ...overrides.sourceRepository,
  };
  const documentRepository: any = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySourceId: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    ...overrides.documentRepository,
  };
  const documentVersionRepository: any = {
    create: vi.fn(),
    findById: vi.fn(),
    findLatest: vi.fn(),
    listByDocument: vi.fn(),
    deactivate: vi.fn(),
    ...overrides.documentVersionRepository,
  };
  const chunkRepository: any = {
    create: vi.fn(),
    createMany: vi.fn(),
    findById: vi.fn(),
    findByDocumentVersion: vi.fn(),
    findByIds: vi.fn(),
    ...overrides.chunkRepository,
  };

  return {
    sourceRepository,
    documentRepository,
    documentVersionRepository,
    chunkRepository,
    entityRepository: {} as never,
    factRepository: {} as never,
    mentionRepository: {},
    executionRunRepository: {} as never,
    executionStepRepository: {} as never,
    outboxRepository: {} as never,
    commit: vi.fn(),
    rollback: vi.fn(),
  };
}

describe("IngestionWorkflow", () => {
  it("creates a new document version and chunks", async () => {
    const uow = createUnitOfWork({
      sourceRepository: {
        findByUri: vi.fn().mockResolvedValue({ ok: true, value: null }),
        create: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "11111111-1111-4111-8111-111111111111",
            tenantId: "22222222-2222-4222-8222-222222222222",
            type: "url",
            uri: "https://example.com/doc.md",
            isActive: true,
            createdAt: "2024-01-15T10:30:00.000Z",
            updatedAt: "2024-01-15T10:30:00.000Z",
          },
        }),
      },
      documentRepository: {
        findBySourceId: vi.fn().mockResolvedValue({ ok: true, value: null }),
        create: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "33333333-3333-4333-8333-333333333333",
            tenantId: "22222222-2222-4222-8222-222222222222",
            sourceId: "11111111-1111-4111-8111-111111111111",
            isActive: true,
            createdAt: "2024-01-15T10:30:00.000Z",
            updatedAt: "2024-01-15T10:30:00.000Z",
          },
        }),
      },
      documentVersionRepository: {
        findLatest: vi.fn().mockResolvedValue({ ok: true, value: null }),
        create: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "44444444-4444-4444-8444-444444444444",
            documentId: "33333333-3333-4333-8333-333333333333",
            tenantId: "22222222-2222-4222-8222-222222222222",
            versionNumber: 1,
            contentHash: "hash",
            checksum: "checksum",
            sizeBytes: 12,
            isActive: true,
            createdAt: "2024-01-15T10:31:00.000Z",
          },
        }),
      },
      chunkRepository: {
        createMany: vi.fn().mockResolvedValue({ ok: true, value: [] }),
      },
    });
    const uowFactory: UnitOfWorkFactory = {
      create: vi.fn(),
      transaction: async (fn) => fn(uow),
    };

    const parser: DocumentParser = {
      canParse: vi.fn(),
      parse: vi.fn().mockResolvedValue({
        title: "Doc",
        content: "# Doc\n\nHello",
        metadata: { mimeType: "text/markdown", uri: "https://example.com/doc.md" },
        sections: [
          {
            type: "heading",
            content: "Doc",
            level: 1,
            locators: [{ type: "heading", path: "doc.md", startLine: 1 }],
          },
          {
            type: "paragraph",
            content: "Hello",
            locators: [{ type: "line", path: "doc.md", startLine: 3, endLine: 3 }],
          },
        ],
      } satisfies ParsedContent),
    };
    const chunker: Chunker = {
      chunk: vi.fn().mockResolvedValue([
        {
          id: "55555555-5555-4555-8555-555555555555",
          documentVersionId: "",
          sequenceNumber: 0,
          content: "Hello",
          contentHash: "hash",
          locator: { type: "line", path: "doc.md", startLine: 3, endLine: 3 },
          createdAt: "2024-01-15T10:31:00.000Z",
        },
      ]),
    };
    const fetcher: ContentFetcher = {
      fetch: vi.fn().mockResolvedValue(Buffer.from("# Doc\n\nHello", "utf8")),
    };

    const workflow = new IngestionWorkflow(uowFactory, parser, chunker, fetcher);
    const result = await workflow.execute({
      sourceUri: "https://example.com/doc.md",
      sourceType: "url",
      mimeType: "text/markdown",
      tenantId: "22222222-2222-4222-8222-222222222222",
      userId: "66666666-6666-4666-8666-666666666666",
      chunkingStrategy: "heading",
      maxChunkSize: 100,
      chunkOverlap: 10,
    });

    expect(result.status).toBe("created");
    expect(result.chunksCreated).toBe(1);
    expect(uow.documentVersionRepository.create).toHaveBeenCalledTimes(1);
    expect(uow.chunkRepository.createMany).toHaveBeenCalledTimes(1);
  });

  it("returns unchanged when checksum matches the latest version", async () => {
    const uow = createUnitOfWork({
      sourceRepository: {
        findByUri: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "11111111-1111-4111-8111-111111111111",
            tenantId: "22222222-2222-4222-8222-222222222222",
            type: "url",
            uri: "https://example.com/doc.md",
            isActive: true,
            createdAt: "2024-01-15T10:30:00.000Z",
            updatedAt: "2024-01-15T10:30:00.000Z",
          },
        }),
      },
      documentRepository: {
        findBySourceId: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "33333333-3333-4333-8333-333333333333",
            tenantId: "22222222-2222-4222-8222-222222222222",
            sourceId: "11111111-1111-4111-8111-111111111111",
            isActive: true,
            createdAt: "2024-01-15T10:30:00.000Z",
            updatedAt: "2024-01-15T10:30:00.000Z",
          },
        }),
      },
      documentVersionRepository: {
        findLatest: vi.fn().mockResolvedValue({
          ok: true,
          value: {
            id: "44444444-4444-4444-8444-444444444444",
            documentId: "33333333-3333-4333-8333-333333333333",
            tenantId: "22222222-2222-4222-8222-222222222222",
            versionNumber: 1,
            contentHash: "hash",
            checksum: createHash("sha256").update("# Doc\n\nHello", "utf8").digest("hex"),
            sizeBytes: 12,
            isActive: true,
            createdAt: "2024-01-15T10:31:00.000Z",
          },
        }),
      },
    });
    const uowFactory: UnitOfWorkFactory = {
      create: vi.fn(),
      transaction: async (fn) => fn(uow),
    };

    const parser: DocumentParser = {
      canParse: vi.fn(),
      parse: vi.fn().mockResolvedValue({
        content: "# Doc\n\nHello",
        metadata: { mimeType: "text/markdown", uri: "https://example.com/doc.md" },
        sections: [],
      } satisfies ParsedContent),
    };
    const chunker: Chunker = {
      chunk: vi.fn(),
    };
    const fetcher: ContentFetcher = {
      fetch: vi.fn().mockResolvedValue(Buffer.from("# Doc\n\nHello", "utf8")),
    };

    const workflow = new IngestionWorkflow(uowFactory, parser, chunker, fetcher);
    const result = await workflow.execute({
      sourceUri: "https://example.com/doc.md",
      sourceType: "url",
      mimeType: "text/markdown",
      tenantId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.status).toBe("unchanged");
    expect(result.chunksCreated).toBe(0);
    expect(uow.documentVersionRepository.create).not.toHaveBeenCalled();
    expect(uow.chunkRepository.createMany).not.toHaveBeenCalled();
  });
});
