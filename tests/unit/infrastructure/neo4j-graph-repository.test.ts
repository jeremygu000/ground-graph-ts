import { describe, expect, it, vi } from "vitest";

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn(),
    auth: { basic: vi.fn() },
    isPath: (value: unknown) => Boolean(value && typeof value === "object" && "segments" in value),
    isDateTime: (value: unknown) =>
      Boolean(
        value &&
        typeof value === "object" &&
        typeof (value as { toStandardDate?: unknown }).toStandardDate === "function",
      ),
    isInt: () => false,
    isNode: () => false,
    isRelationship: () => false,
    integer: { toNumber: (value: unknown) => Number(value) },
    types: {
      DateTime: class DateTime {
        static fromStandardDate(date: Date) {
          return { toStandardDate: () => date };
        }
      },
    },
  },
  driver: vi.fn(),
  auth: { basic: vi.fn() },
  Driver: class Driver {},
  Session: class Session {},
  ManagedTransaction: class ManagedTransaction {},
}));

import { Neo4jGraphRepository } from "../../../src/infrastructure/neo4j/graph-repository";

type RecordLike = { get: (field: string) => unknown };

function createRecord(fields: Record<string, unknown>): RecordLike {
  return {
    get(field: string) {
      return fields[field];
    },
  };
}

function createClient(
  executeReadResult: (
    query: string,
    params: Record<string, unknown>,
  ) =>
    | Promise<{ records: RecordLike[] }>
    | {
        records: RecordLike[];
      },
  executeWriteResult: (
    query: string,
    params: Record<string, unknown>,
  ) =>
    | Promise<{ records: RecordLike[] }>
    | {
        records: RecordLike[];
      },
) {
  return {
    executeRead: vi.fn(
      async (
        fn: (tx: {
          run: (
            query: string,
            params: Record<string, unknown>,
          ) => Promise<{ records: RecordLike[] }>;
        }) => Promise<unknown>,
      ) =>
        fn({
          run: (query: string, params: Record<string, unknown>) =>
            Promise.resolve(executeReadResult(query, params)),
        }),
    ),
    executeWrite: vi.fn(
      async (
        fn: (tx: {
          run: (
            query: string,
            params: Record<string, unknown>,
          ) => Promise<{ records: RecordLike[] }>;
        }) => Promise<unknown>,
      ) =>
        fn({
          run: (query: string, params: Record<string, unknown>) =>
            Promise.resolve(executeWriteResult(query, params)),
        }),
    ),
  };
}

describe("Neo4jGraphRepository", () => {
  it("traverses, finds paths, and finds connected entities", async () => {
    const path = {
      segments: [
        {
          start: { properties: { id: "entity-a" } },
          relationship: { type: "SUBJECT_OF", properties: { factId: "fact-1" } },
          end: { properties: { id: "entity-b" } },
        },
      ],
    };

    const client = createClient(
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: 1,
            hops: 1,
            path,
            relationship: "connected",
          }),
        ],
      }),
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: 1,
            hops: 1,
            path,
            relationship: "connected",
          }),
        ],
      }),
    );

    const repository = new Neo4jGraphRepository(client as never);

    await expect(
      repository.traverse(
        { seedEntityIds: ["seed-1"], maxDepth: 2, validAsOf: "2024-01-01T00:00:00.000Z" },
        "tenant-1",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        {
          entityId: "entity-b",
          depth: 1,
          path: [{ fromId: "entity-a", predicate: "SUBJECT_OF", toId: "entity-b" }],
        },
      ],
    });

    await expect(
      repository.findPaths(
        { startEntityId: "entity-a", endEntityId: "entity-b", maxHops: 2 },
        "tenant-1",
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: [
        {
          totalHops: 1,
          path: [
            {
              fromId: "entity-a",
              predicate: "SUBJECT_OF",
              toId: "entity-b",
              factId: "fact-1",
            },
          ],
        },
      ],
    });

    await expect(
      repository.findConnectedEntities("entity-a", 2, "tenant-1"),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ entityId: "entity-b", relationship: "connected", depth: 1 }],
    });
  });

  it("projects and deletes facts, and fails closed on invalid facts", async () => {
    const factId = "11111111-1111-4111-8111-111111111111";
    const client = createClient(
      async () => ({ records: [] }),
      async (query) => {
        if (query.includes("DETACH DELETE fact")) {
          return { records: [] };
        }
        return {
          records: [
            createRecord({
              factId,
            }),
          ],
        };
      },
    );

    const repository = new Neo4jGraphRepository(client as never);
    const validFact = {
      id: factId,
      tenantId: "22222222-2222-4222-8222-222222222222",
      subjectId: "33333333-3333-4333-8333-333333333333",
      predicate: "mentions",
      objectId: "44444444-4444-4444-8444-444444444444",
      status: "candidate" as const,
      extractionMethod: "llm" as const,
      confidence: 0.92,
      validFrom: "2024-01-01T00:00:00.000Z",
      observedAt: "2024-01-01T00:00:00.000Z",
      createdAt: "2024-01-01T00:00:00.000Z",
      provenance: {
        sourceVersionId: "55555555-5555-4555-8555-555555555555",
        evidenceText: "evidence",
      },
    };

    await expect(repository.projectFact(validFact)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(repository.removeFact(factId, validFact.tenantId)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    await expect(
      repository.projectFact({
        ...validFact,
        objectId: undefined,
        objectValue: undefined,
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.any(Error) });
  });

  it("returns an error when traversal response is malformed", async () => {
    const client = createClient(
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: 1,
            path: {
              segments: [
                {
                  start: { properties: {} },
                  relationship: { type: "SUBJECT_OF" },
                  end: { properties: { id: "entity-b" } },
                },
              ],
            },
          }),
        ],
      }),
      async () => ({ records: [] }),
    );
    const repository = new Neo4jGraphRepository(client as never);

    const result = await repository.traverse({ seedEntityIds: ["seed-1"] }, "tenant-1");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected traversal failure");
    }
    expect(result.error.message).toContain("expected string id");
  });

  it("covers additional neo4j repository failure branches", async () => {
    const invalidNumberClient = createClient(
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: "oops",
            path: {
              segments: [
                {
                  start: { properties: { id: "entity-a" } },
                  relationship: { type: "SUBJECT_OF" },
                  end: { properties: { id: "entity-b" } },
                },
              ],
            },
          }),
        ],
      }),
      async () => ({ records: [] }),
    );
    const invalidNumberRepo = new Neo4jGraphRepository(invalidNumberClient as never);
    await expect(
      invalidNumberRepo.traverse({ seedEntityIds: ["seed-1"] }, "tenant-1"),
    ).resolves.toMatchObject({ ok: false, error: expect.any(Error) });

    const invalidRelationshipClient = createClient(
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: 1,
            path: {
              segments: [
                {
                  start: { properties: { id: "entity-a" } },
                  relationship: { type: "WRONG" },
                  end: { properties: { id: "entity-b" } },
                },
              ],
            },
          }),
        ],
      }),
      async () => ({
        records: [
          createRecord({
            entityId: "entity-b",
            depth: 1,
            hops: 1,
            path: {
              segments: [
                {
                  start: { properties: { id: "entity-a" } },
                  relationship: { type: "WRONG" },
                  end: { properties: { id: "entity-b" } },
                },
              ],
            },
          }),
        ],
      }),
    );
    const invalidRelationshipRepo = new Neo4jGraphRepository(invalidRelationshipClient as never);
    await expect(
      invalidRelationshipRepo.findPaths(
        { startEntityId: "entity-a", endEntityId: "entity-b" },
        "tenant-1",
      ),
    ).resolves.toMatchObject({ ok: false, error: expect.any(Error) });
    await expect(
      invalidRelationshipRepo.findConnectedEntities("entity-a", 2, "tenant-1"),
    ).resolves.toMatchObject({ ok: false, error: expect.any(Error) });

    const objectValueClient = createClient(
      async () => ({ records: [] }),
      async (query) => {
        if (query.includes("value:Value")) {
          return {
            records: [
              createRecord({
                factId: "11111111-1111-4111-8111-111111111111",
              }),
            ],
          };
        }
        return { records: [] };
      },
    );
    const objectValueRepo = new Neo4jGraphRepository(objectValueClient as never);
    await expect(
      objectValueRepo.projectFact({
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: "22222222-2222-4222-8222-222222222222",
        subjectId: "33333333-3333-4333-8333-333333333333",
        predicate: "mentions",
        objectValue: "plain text",
        status: "candidate",
        extractionMethod: "llm",
        confidence: 0.92,
        validFrom: "2024-01-01T00:00:00.000Z",
        observedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        provenance: {
          sourceVersionId: "55555555-5555-4555-8555-555555555555",
          evidenceText: "evidence",
        },
      }),
    ).resolves.toEqual({ ok: true, value: undefined });

    const zeroWriteClient = createClient(
      async () => ({ records: [] }),
      async () => ({ records: [] }),
    );
    const zeroWriteRepo = new Neo4jGraphRepository(zeroWriteClient as never);
    await expect(
      zeroWriteRepo.projectFact({
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: "22222222-2222-4222-8222-222222222222",
        subjectId: "33333333-3333-4333-8333-333333333333",
        predicate: "mentions",
        objectId: "44444444-4444-4444-8444-444444444444",
        status: "candidate",
        extractionMethod: "llm",
        confidence: 0.92,
        validFrom: "2024-01-01T00:00:00.000Z",
        observedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        provenance: {
          sourceVersionId: "55555555-5555-4555-8555-555555555555",
          evidenceText: "evidence",
        },
      }),
    ).resolves.toMatchObject({ ok: false, error: expect.any(Error) });
  });
});
