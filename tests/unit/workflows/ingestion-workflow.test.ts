import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Chunker } from "../../../src/application/ingestion/chunker-port";
import type { ContentFetcher } from "../../../src/application/ingestion/content-fetcher-port";
import type { DocumentParser, ParsedContent } from "../../../src/application/ingestion/parser-port";
import type { UnitOfWorkFactory } from "../../../src/application/unit-of-work";
import type { TracerPort } from "../../../src/application/observability/tracer-port";
import { IngestionWorkflow } from "../../../src/workflows/ingestion/ingestion-workflow";

function createMockTracer(): TracerPort {
  return {
    startActiveSpan: async <T>(_name: string, fn: (span: any) => Promise<T>) => {
      const span = {
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
      };
      return fn(span);
    },
    startSpan: (_name: string) => ({
      setAttribute: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
    }),
  };
}

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
    listByDocument: vi.fn().mockResolvedValue({ ok: true, value: [] }),
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

type WorkflowInternals = {
  recordSyncState: (...args: any[]) => Promise<void>;
  generateQualityReport: (...args: any[]) => any;
  deactivateStaleVersions: (...args: any[]) => Promise<void>;
};

describe("IngestionWorkflow", () => {
  const minimalInput = {
    sourceUri: "file:///doc.md",
    sourceType: "file" as const,
    tenantId: "tenant-1",
    principalId: "principal-1",
  };

  it("covers durable sync-state create/update/no-op paths", async () => {
    const syncRepo = {
      findBySourceId: vi.fn().mockResolvedValue({ ok: true, value: null }),
      create: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      update: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    };
    const workflow = new IngestionWorkflow(
      { create: vi.fn().mockResolvedValue({ sourceSyncStateRepository: syncRepo }) } as never,
      {} as never,
      {} as never,
      {} as never,
      createMockTracer(),
    );
    await (workflow as unknown as WorkflowInternals).recordSyncState(
      "source-1",
      minimalInput,
      { syncStatus: "syncing", lastChangeHash: "hash" },
      true,
    );
    syncRepo.findBySourceId.mockResolvedValueOnce({ ok: true, value: { id: "state-1" } });
    await (workflow as unknown as WorkflowInternals).recordSyncState(
      "source-1",
      minimalInput,
      { syncStatus: "idle" },
      false,
    );
    expect(syncRepo.create).toHaveBeenCalledTimes(1);
    expect(syncRepo.update).toHaveBeenCalledTimes(1);
  });

  it("propagates sync-state repository errors", async () => {
    const input = minimalInput;
    const makeWorkflow = (repo: Record<string, unknown>) =>
      new IngestionWorkflow(
        { create: vi.fn().mockResolvedValue({ sourceSyncStateRepository: repo }) } as never,
        {} as never,
        {} as never,
        {} as never,
        createMockTracer(),
      );
    await expect(
      (
        makeWorkflow({
          findBySourceId: vi.fn().mockResolvedValue({ ok: false, error: new Error("find") }),
        }) as unknown as WorkflowInternals
      ).recordSyncState("s", input, { syncStatus: "syncing" }, true),
    ).rejects.toThrow("find");
    await expect(
      (
        makeWorkflow({
          findBySourceId: vi.fn().mockResolvedValue({ ok: true, value: { id: "s" } }),
          update: vi.fn().mockResolvedValue({ ok: false, error: new Error("update") }),
        }) as unknown as WorkflowInternals
      ).recordSyncState("s", input, { syncStatus: "idle" }, true),
    ).rejects.toThrow("update");
    await expect(
      (
        makeWorkflow({
          findBySourceId: vi.fn().mockResolvedValue({ ok: true, value: null }),
          create: vi.fn().mockResolvedValue({ ok: false, error: new Error("create") }),
        }) as unknown as WorkflowInternals
      ).recordSyncState("s", input, { syncStatus: "idle" }, true),
    ).rejects.toThrow("create");
  });

  it("reports quality metrics for empty, duplicate, and empty chunks", () => {
    const workflow = new IngestionWorkflow(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      createMockTracer(),
    );
    const report = (workflow as unknown as WorkflowInternals).generateQualityReport(
      "doc",
      "ver",
      "file:///doc",
      [
        { content: "same", contentHash: "h", locator: { type: "line", path: "doc", startLine: 1 } },
        { content: "same", contentHash: "h", locator: { type: "line", path: "doc", startLine: 2 } },
        {
          content: " ",
          contentHash: "blank",
          locator: { type: "line", path: "doc", startLine: 3 },
        },
      ],
      "principal",
    );
    expect(report.qualityMetrics).toMatchObject({
      totalChunks: 3,
      duplicateChunks: 1,
      emptyChunks: 1,
      minChunkSize: 1,
    });
    expect(
      (workflow as unknown as WorkflowInternals).generateQualityReport(
        "doc",
        "ver",
        "file:///doc",
        [],
        "principal",
      ).qualityMetrics.avgChunkSize,
    ).toBe(0);
  });

  it("deactivates stale versions and surfaces repository failures", async () => {
    const uow = createUnitOfWork({
      documentVersionRepository: {
        listByDocument: vi.fn().mockResolvedValue({
          ok: true,
          value: [
            { id: "old", isActive: true },
            { id: "current", isActive: true },
            { id: "off", isActive: false },
          ],
        }),
        deactivate: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      },
    });
    const workflow = new IngestionWorkflow(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      createMockTracer(),
    );
    await (workflow as unknown as WorkflowInternals).deactivateStaleVersions(
      uow,
      "doc",
      "current",
      "tenant-1",
    );
    expect(uow.documentVersionRepository.deactivate).toHaveBeenCalledWith("old", "tenant-1");
    uow.documentVersionRepository.listByDocument.mockResolvedValueOnce({ ok: true, value: [] });
    await (workflow as unknown as WorkflowInternals).deactivateStaleVersions(
      uow,
      "doc",
      "current",
      "tenant-1",
    );
  });

  it("deactivates a source through the application transaction", async () => {
    const deactivate = vi.fn().mockResolvedValue({ ok: true, value: undefined });
    const workflow = new IngestionWorkflow(
      {
        transaction: vi.fn(async (fn: (uow: unknown) => Promise<unknown>) =>
          fn({ sourceRepository: { deactivate } }),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      createMockTracer(),
    );
    await workflow.deactivateSource("source-1", "tenant-1");
    expect(deactivate).toHaveBeenCalledWith("source-1", "tenant-1");
  });

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

    const workflow = new IngestionWorkflow(
      uowFactory,
      parser,
      chunker,
      fetcher,
      createMockTracer(),
    );
    const result = await workflow.execute({
      sourceUri: "https://example.com/doc.md",
      sourceType: "url",
      mimeType: "text/markdown",
      tenantId: "22222222-2222-4222-8222-222222222222",
      principalId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
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
            principalId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
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
            principalId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
            versionNumber: 2,
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
      chunk: vi.fn().mockResolvedValue([]),
    };
    const fetcher: ContentFetcher = {
      fetch: vi.fn().mockResolvedValue(Buffer.from("# Doc\n\nHello", "utf8")),
    };

    const workflow = new IngestionWorkflow(
      uowFactory,
      parser,
      chunker,
      fetcher,
      createMockTracer(),
    );
    const result = await workflow.execute({
      sourceUri: "https://example.com/doc.md",
      sourceType: "url",
      mimeType: "text/markdown",
      tenantId: "22222222-2222-4222-8222-222222222222",
      principalId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    });

    expect(result.status).toBe("unchanged");
    expect(result.chunksCreated).toBe(0);
    expect(uow.documentVersionRepository.create).not.toHaveBeenCalled();
    expect(uow.chunkRepository.createMany).not.toHaveBeenCalled();
  });

  it("deletes uploaded raw content when chunk persistence fails", async () => {
    const source = {
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      type: "url" as const,
      uri: "https://example.com/failure.md",
      isActive: true,
      createdAt: "2024-01-15T10:30:00.000Z",
      updatedAt: "2024-01-15T10:30:00.000Z",
    };
    const document = {
      id: "33333333-3333-4333-8333-333333333333",
      tenantId: source.tenantId,
      sourceId: source.id,
      isActive: true,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    };
    const version = {
      id: "44444444-4444-4444-8444-444444444444",
      documentId: document.id,
      tenantId: source.tenantId,
      versionNumber: 1,
      contentHash: "hash",
      checksum: "checksum",
      sizeBytes: 4,
      isActive: true,
      createdAt: source.createdAt,
    };
    const uow = createUnitOfWork({
      sourceRepository: {
        findByUri: vi.fn().mockResolvedValue({ ok: true, value: source }),
        update: vi.fn().mockResolvedValue({ ok: true, value: source }),
      },
      documentRepository: {
        findBySourceId: vi.fn().mockResolvedValue({ ok: true, value: null }),
        create: vi.fn().mockResolvedValue({ ok: true, value: document }),
      },
      documentVersionRepository: {
        create: vi.fn().mockResolvedValue({ ok: true, value: version }),
      },
      chunkRepository: {
        createMany: vi.fn().mockResolvedValue({
          ok: false,
          error: new Error("database unavailable"),
        }),
      },
    });
    const objectStorage = {
      upload: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      download: vi.fn(),
      exists: vi.fn(),
      getMetadata: vi.fn(),
    };
    const workflow = new IngestionWorkflow(
      { create: vi.fn(), transaction: async (fn) => fn(uow) },
      {
        canParse: vi.fn(),
        parse: vi.fn().mockResolvedValue({
          content: "text",
          metadata: {},
          sections: [{ type: "paragraph", content: "text", locators: [] }],
        } satisfies ParsedContent),
      },
      {
        chunk: vi.fn().mockResolvedValue([
          {
            id: "55555555-5555-4555-8555-555555555555",
            documentVersionId: "",
            sequenceNumber: 0,
            content: "text",
            contentHash: "hash",
            locator: {},
            createdAt: source.createdAt,
          },
        ]),
      },
      { fetch: vi.fn().mockResolvedValue(Buffer.from("text")) },
      createMockTracer(),
      objectStorage,
    );

    await expect(
      workflow.execute({
        sourceUri: source.uri,
        sourceType: "url",
        tenantId: source.tenantId,
        principalId: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      }),
    ).rejects.toThrow("Failed to create chunks");
    expect(objectStorage.delete).toHaveBeenCalledWith(`raw/${source.id}/${version.id}`, "raw");
  });
});
