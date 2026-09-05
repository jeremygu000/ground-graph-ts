import { describe, expect, it, vi } from "vitest";
import { PostgresSourceRepository } from "../../../src/infrastructure/postgres/repositories/source-repository";
import { PostgresDocumentRepository } from "../../../src/infrastructure/postgres/repositories/document-repository";
import { PostgresDocumentVersionRepository } from "../../../src/infrastructure/postgres/repositories/document-version-repository";
import { PostgresChunkRepository } from "../../../src/infrastructure/postgres/repositories/chunk-repository";
import { PostgresEntityRepository } from "../../../src/infrastructure/postgres/repositories/entity-repository";
import { PostgresFactRepository } from "../../../src/infrastructure/postgres/repositories/fact-repository";

type QueueMap = {
  select?: unknown[];
  insert?: unknown[];
  update?: unknown[];
};

function createThenable(result: unknown) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(result)),
    for: vi.fn(() => chain),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function createDbMock(queues: QueueMap = {}) {
  const selectQueue = [...(queues.select ?? [])];
  const insertQueue = [...(queues.insert ?? [])];
  const updateQueue = [...(queues.update ?? [])];

  return {
    drizzle: {
      select: vi.fn(() => createThenable(selectQueue.shift())),
      insert: vi.fn(() => createThenable(insertQueue.shift())),
      update: vi.fn(() => createThenable(updateQueue.shift())),
    },
  };
}

const sourceRow = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  type: "url",
  uri: "https://example.com/doc.md",
  mimeType: "text/markdown",
  metadata: { lang: "en" },
  isActive: true,
  lastSyncedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const documentRow = {
  id: "33333333-3333-4333-8333-333333333333",
  tenantId: "22222222-2222-4222-8222-222222222222",
  sourceId: sourceRow.id,
  title: "Doc",
  metadata: { kind: "guide" },
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const versionRow = {
  id: "44444444-4444-4444-8444-444444444444",
  documentId: documentRow.id,
  tenantId: documentRow.tenantId,
  versionNumber: 1,
  contentHash: "hash",
  checksum: "checksum",
  sizeBytes: 12,
  parsedDocument: null,
  isActive: true,
  createdAt: "2024-01-01T00:00:00.000Z",
  createdBy: "66666666-6666-4666-8666-666666666666",
};

const chunkRow = {
  id: "55555555-5555-4555-8555-555555555555",
  documentVersionId: versionRow.id,
  tenantId: versionRow.tenantId,
  sequenceNumber: 0,
  content: "Hello",
  contentHash: "hash",
  locator: { type: "line", path: "doc.md", startLine: 3, endLine: 3 },
  metadata: { label: "body" },
  createdAt: "2024-01-01T00:00:00.000Z",
};

const entityRow = {
  id: "77777777-7777-4777-8777-777777777777",
  tenantId: sourceRow.tenantId,
  canonicalName: "Acme",
  entityType: "org",
  aliases: ["Acme Inc."],
  attributes: { employees: 12 },
  description: "Company",
  validFrom: "2024-01-01T00:00:00.000Z",
  validTo: null,
  supersededBy: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  createdBy: "66666666-6666-4666-8666-666666666666",
};

const factRow = {
  id: "88888888-8888-4888-8888-888888888888",
  tenantId: sourceRow.tenantId,
  subjectId: entityRow.id,
  predicate: "works_for",
  objectId: null,
  objectValue: "Acme",
  status: "candidate",
  extractionMethod: "llm",
  confidence: 0.9,
  validFrom: "2024-01-01T00:00:00.000Z",
  validTo: null,
  observedAt: "2024-01-01T00:00:00.000Z",
  supersededBy: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  createdBy: "66666666-6666-4666-8666-666666666666",
  provenance: { sourceVersionId: versionRow.id, chunkId: chunkRow.id, evidenceText: "evidence" },
};

describe("postgres repositories", () => {
  it("covers source repository", async () => {
    const db = createDbMock({
      insert: [[sourceRow]],
      select: [[sourceRow], [sourceRow], [sourceRow]],
      update: [[sourceRow], undefined],
    });
    const repo = new PostgresSourceRepository(db as never);

    await expect(
      repo.create(
        {
          type: "url",
          uri: sourceRow.uri,
          mimeType: sourceRow.mimeType,
          metadata: sourceRow.metadata,
        },
        sourceRow.tenantId,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(sourceRow.id, sourceRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.findByUri(sourceRow.uri, sourceRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.update(sourceRow.id, sourceRow.tenantId, { mimeType: "text/plain" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.deactivate(sourceRow.id, sourceRow.tenantId)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(repo.list(sourceRow.tenantId)).resolves.toMatchObject({ ok: true });
  });

  it("covers document repository", async () => {
    const db = createDbMock({
      insert: [[documentRow]],
      select: [[documentRow], [documentRow], [documentRow]],
      update: [[documentRow]],
    });
    const repo = new PostgresDocumentRepository(db as never);

    await expect(
      repo.create(
        { sourceId: sourceRow.id, title: documentRow.title, metadata: documentRow.metadata },
        documentRow.tenantId,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(documentRow.id, documentRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.findBySourceId(sourceRow.id, documentRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.update(documentRow.id, documentRow.tenantId, { title: "Updated" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.list(documentRow.tenantId)).resolves.toMatchObject({ ok: true });
  });

  it("covers document version and chunk repositories", async () => {
    const db = createDbMock({
      insert: [[versionRow], [chunkRow], [chunkRow]],
      select: [[versionRow], [versionRow], [versionRow], [chunkRow], [chunkRow], [chunkRow]],
      update: [undefined],
    });
    const versionRepo = new PostgresDocumentVersionRepository(db as never);
    const chunkRepo = new PostgresChunkRepository(db as never);

    await expect(
      versionRepo.create(documentRow.id, {
        id: versionRow.id,
        tenantId: versionRow.tenantId,
        versionNumber: versionRow.versionNumber,
        contentHash: versionRow.contentHash,
        checksum: versionRow.checksum,
        sizeBytes: versionRow.sizeBytes,
        isActive: true,
        createdBy: versionRow.createdBy,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(versionRepo.findById(versionRow.id, versionRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      versionRepo.findLatest(documentRow.id, versionRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      versionRepo.listByDocument(documentRow.id, versionRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(versionRepo.deactivate(versionRow.id, versionRow.tenantId)).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    await expect(
      chunkRepo.create({ ...chunkRow, id: undefined } as never, chunkRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      chunkRepo.createMany([{ ...chunkRow, id: undefined } as never], chunkRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(chunkRepo.findById(chunkRow.id, chunkRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      chunkRepo.findByDocumentVersion(chunkRow.documentVersionId, chunkRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(chunkRepo.findByIds([chunkRow.id], chunkRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
  });

  it("covers entity repository", async () => {
    const db = createDbMock({
      insert: [[entityRow]],
      select: [
        [entityRow],
        [entityRow],
        [entityRow, { ...entityRow, aliases: ["Other"] }],
        [entityRow],
        [entityRow],
      ],
      update: [[entityRow], undefined],
    });
    const repo = new PostgresEntityRepository(db as never);

    await expect(repo.create(entityRow as never)).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(entityRow.id, entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.findByCanonicalName(entityRow.canonicalName, entityRow.tenantId),
    ).resolves.toMatchObject({ ok: true });
    await expect(repo.findByAlias("Acme Inc.", entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.update(entityRow.id, entityRow.tenantId, { description: "Updated" }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repo.supersede(entityRow.id, entityRow.tenantId, "99999999-9999-4999-8999-999999999999"),
    ).resolves.toEqual({ ok: true, value: undefined });
    await expect(repo.listByType(entityRow.entityType, entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.list(entityRow.tenantId)).resolves.toMatchObject({ ok: true });
  });

  it("covers fact repository", async () => {
    const db = createDbMock({
      insert: [[factRow], [factRow]],
      select: [[factRow], [factRow], [factRow], [factRow], [factRow]],
      update: [[factRow], undefined],
    });
    const repo = new PostgresFactRepository(db as never);

    await expect(repo.create(factRow as never)).resolves.toMatchObject({ ok: true });
    await expect(repo.createMany([factRow as never])).resolves.toMatchObject({ ok: true });
    await expect(repo.findById(factRow.id, factRow.tenantId)).resolves.toMatchObject({ ok: true });
    await expect(repo.findBySubject(factRow.subjectId, factRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.findByPredicate(factRow.predicate, factRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(repo.findByStatus("candidate", factRow.tenantId)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      repo.findTemporal(factRow.subjectId, factRow.predicate, factRow.tenantId, factRow.validFrom),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repo.updateStatus(factRow.id, factRow.tenantId, "verified"),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      repo.supersede(factRow.id, factRow.tenantId, "99999999-9999-4999-8999-999999999999"),
    ).resolves.toEqual({ ok: true, value: undefined });
  });

  it("covers repository empty-result and error branches", async () => {
    const sourceRepo = new PostgresSourceRepository({
      drizzle: {
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
        insert: vi.fn().mockRejectedValue(new Error("source boom")),
      },
    } as never);
    await expect(
      sourceRepo.create({ type: "url", uri: sourceRow.uri }, sourceRow.tenantId),
    ).resolves.toMatchObject({ ok: false });
    await expect(sourceRepo.findById(sourceRow.id, sourceRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(
      sourceRepo.update(sourceRow.id, sourceRow.tenantId, { mimeType: "text/plain" }),
    ).resolves.toMatchObject({ ok: false });

    const documentRepo = new PostgresDocumentRepository(
      createDbMock({ select: [[]], update: [[]] }) as never,
    );
    await expect(
      documentRepo.findById(documentRow.id, documentRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: null });
    await expect(
      documentRepo.update(documentRow.id, documentRow.tenantId, { title: "Updated" }),
    ).resolves.toMatchObject({ ok: false });

    const versionRepo = new PostgresDocumentVersionRepository({
      drizzle: {
        select: vi.fn(() => createThenable([])),
        insert: vi.fn().mockRejectedValue(new Error("version boom")),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(versionRepo.findById(versionRow.id, versionRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(
      versionRepo.findLatest(documentRow.id, versionRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: null });
    await expect(
      versionRepo.create(documentRow.id, {
        id: versionRow.id,
        tenantId: versionRow.tenantId,
        versionNumber: versionRow.versionNumber,
        contentHash: versionRow.contentHash,
        checksum: versionRow.checksum,
        sizeBytes: versionRow.sizeBytes,
        isActive: true,
      }),
    ).resolves.toMatchObject({ ok: false });

    const chunkRepo = new PostgresChunkRepository(
      createDbMock({ select: [[], []], insert: [[]], update: [[]] }) as never,
    );
    await expect(chunkRepo.findById(chunkRow.id, chunkRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(chunkRepo.findByIds([chunkRow.id], chunkRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });

    const entityRepo = new PostgresEntityRepository({
      drizzle: {
        select: vi.fn(() => createThenable([])),
        insert: vi.fn().mockRejectedValue(new Error("entity boom")),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(entityRepo.findById(entityRow.id, entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(
      entityRepo.update(entityRow.id, entityRow.tenantId, { description: "Updated" }),
    ).resolves.toMatchObject({ ok: false });

    const factRepo = new PostgresFactRepository({
      drizzle: {
        select: vi.fn(() => createThenable([])),
        insert: vi.fn().mockRejectedValue(new Error("fact boom")),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(factRepo.findById(factRow.id, factRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(
      factRepo.updateStatus(factRow.id, factRow.tenantId, "verified"),
    ).resolves.toMatchObject({ ok: false });
  });

  it("covers additional empty-result branches across repositories", async () => {
    const sourceRepo = new PostgresSourceRepository(createDbMock({ select: [[], []] }) as never);
    await expect(sourceRepo.findByUri(sourceRow.uri, sourceRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: null,
    });
    await expect(sourceRepo.list(sourceRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });

    const documentRepo = new PostgresDocumentRepository(
      createDbMock({ select: [[], []] }) as never,
    );
    await expect(
      documentRepo.findBySourceId(sourceRow.id, sourceRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: null });
    await expect(documentRepo.list(documentRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });

    const versionRepo = new PostgresDocumentVersionRepository(
      createDbMock({ select: [[], []] }) as never,
    );
    await expect(
      versionRepo.listByDocument(documentRow.id, documentRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: [] });

    const chunkRepo = new PostgresChunkRepository(createDbMock({ select: [[]] }) as never);
    await expect(
      chunkRepo.findByDocumentVersion(chunkRow.documentVersionId, chunkRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: [] });

    const entityRepo = new PostgresEntityRepository(
      createDbMock({ select: [[], [], []] }) as never,
    );
    await expect(
      entityRepo.findByCanonicalName(entityRow.canonicalName, entityRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: null });
    await expect(entityRepo.findByAlias("missing", entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });
    await expect(entityRepo.list(entityRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });

    const factRepo = new PostgresFactRepository(
      createDbMock({ select: [[], [], [], []] }) as never,
    );
    await expect(
      factRepo.findBySubject(factRow.subjectId, factRow.tenantId),
    ).resolves.toMatchObject({
      ok: true,
      value: [],
    });
    await expect(
      factRepo.findByPredicate(factRow.predicate, factRow.tenantId),
    ).resolves.toMatchObject({ ok: true, value: [] });
    await expect(factRepo.findByStatus("candidate", factRow.tenantId)).resolves.toMatchObject({
      ok: true,
      value: [],
    });
    await expect(
      factRepo.findTemporal(
        factRow.subjectId,
        factRow.predicate,
        factRow.tenantId,
        factRow.validFrom,
      ),
    ).resolves.toMatchObject({ ok: true, value: null });
  });

  it("covers repository failure branches across create and update paths", async () => {
    const sourceRepo = new PostgresSourceRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("source boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(
      sourceRepo.create(
        {
          type: "url",
          uri: sourceRow.uri,
        },
        sourceRow.tenantId,
      ),
    ).resolves.toMatchObject({ ok: false });

    const documentRepo = new PostgresDocumentRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("document boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(
      documentRepo.create(
        {
          sourceId: sourceRow.id,
        },
        documentRow.tenantId,
      ),
    ).resolves.toMatchObject({ ok: false });

    const versionRepo = new PostgresDocumentVersionRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("version boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(
      versionRepo.create(documentRow.id, {
        id: versionRow.id,
        tenantId: versionRow.tenantId,
        versionNumber: versionRow.versionNumber,
        contentHash: versionRow.contentHash,
        checksum: versionRow.checksum,
        sizeBytes: versionRow.sizeBytes,
        isActive: true,
      }),
    ).resolves.toMatchObject({ ok: false });

    const chunkRepo = new PostgresChunkRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("chunk boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(
      chunkRepo.createMany([{ ...chunkRow, id: undefined } as never], chunkRow.tenantId),
    ).resolves.toMatchObject({ ok: false });

    const entityRepo = new PostgresEntityRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("entity boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(entityRepo.create(entityRow as never)).resolves.toMatchObject({ ok: false });

    const factRepo = new PostgresFactRepository({
      drizzle: {
        insert: vi.fn().mockRejectedValue(new Error("fact boom")),
        select: vi.fn(() => createThenable([])),
        update: vi.fn(() => createThenable([])),
      },
    } as never);
    await expect(factRepo.create(factRow as never)).resolves.toMatchObject({ ok: false });
    await expect(factRepo.createMany([factRow as never])).resolves.toMatchObject({ ok: false });
    await expect(
      factRepo.updateStatus(factRow.id, factRow.tenantId, "verified"),
    ).resolves.toMatchObject({ ok: false });
  });
});
