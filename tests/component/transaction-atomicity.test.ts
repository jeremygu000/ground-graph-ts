import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  chunks,
  documentVersions,
  documents,
  indexVersions,
  outboxEvents,
  sourceSyncState,
  sources,
} from "../../src/infrastructure/postgres/schema";
import { DefaultUnitOfWorkFactory } from "../../src/infrastructure/unit-of-work";
import { assertContainerRuntime, startComponentDatabase } from "./test-support";
import { IngestionWorkflow } from "../../src/workflows/ingestion/ingestion-workflow";

await assertContainerRuntime();

describe("TransactionalUnitOfWork", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let uowFactory: DefaultUnitOfWorkFactory;
  const tenantId = crypto.randomUUID();
  const principalId = crypto.randomUUID();

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    uowFactory = new DefaultUnitOfWorkFactory(ctx.db, {
      verifyConnectivity: async () => undefined,
    } as never);
  }, 120_000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("rolls back source and outbox writes when the transaction fails", async () => {
    const uri = `https://example.com/${crypto.randomUUID()}`;

    await expect(
      uowFactory.transaction(async (uow) => {
        const sourceResult = await uow.sourceRepository.create(
          { type: "url", uri },
          tenantId,
          principalId,
        );
        expect(sourceResult.ok, sourceResult.ok ? undefined : sourceResult.error.message).toBe(
          true,
        );
        if (!sourceResult.ok) throw sourceResult.error;

        const outboxResult = await uow.outboxRepository.create({
          id: crypto.randomUUID(),
          tenantId,
          aggregateType: "source",
          aggregateId: crypto.randomUUID(),
          eventType: "source.created",
          payload: { uri },
          idempotencyKey: `key-${Date.now()}`,
          status: "pending",
          attempts: 0,
          availableAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        expect(outboxResult.ok, outboxResult.ok ? undefined : outboxResult.error.message).toBe(
          true,
        );
        if (!outboxResult.ok) throw outboxResult.error;

        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    const sourceRows = await ctx.db.drizzle.select().from(sources);
    const outboxRows = await ctx.db.drizzle.select().from(outboxEvents);
    expect(sourceRows).toHaveLength(0);
    expect(outboxRows).toHaveLength(0);
  });

  it("commits source and outbox writes when the transaction succeeds", async () => {
    const uri = `https://example.com/${crypto.randomUUID()}`;

    const result = await uowFactory.transaction(async (uow) => {
      const sourceResult = await uow.sourceRepository.create(
        { type: "url", uri },
        tenantId,
        principalId,
      );
      expect(sourceResult.ok, sourceResult.ok ? undefined : sourceResult.error.message).toBe(true);
      if (!sourceResult.ok) throw sourceResult.error;

      const outboxResult = await uow.outboxRepository.create({
        id: crypto.randomUUID(),
        tenantId,
        aggregateType: "source",
        aggregateId: sourceResult.value.id,
        eventType: "source.created",
        payload: { uri },
        idempotencyKey: `key-${Date.now()}`,
        status: "pending",
        attempts: 0,
        availableAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(outboxResult.ok, outboxResult.ok ? undefined : outboxResult.error.message).toBe(true);
      if (!outboxResult.ok) throw outboxResult.error;

      return sourceResult.value;
    });

    expect(result.id).toBeDefined();

    const sourceRows = await ctx.db.drizzle.select().from(sources);
    const outboxRows = await ctx.db.drizzle.select().from(outboxEvents);
    expect(sourceRows).toHaveLength(1);
    expect(outboxRows).toHaveLength(1);
  });

  it("deactivates old version when new version is activated", async () => {
    const v1Result = await uowFactory.transaction(async (uow) => {
      const result = await uow.vectorIndexRepository.activateIndexVersion({
        tenantId,
        versionNumber: 1,
        embeddingModel: "text-embedding-3-small",
        embeddingDimension: 1536,
        isActive: true,
      });
      if (!result.ok) throw result.error;
      return result.value;
    });

    expect(v1Result.indexVersionId).toBeDefined();

    const v2Result = await uowFactory.transaction(async (uow) => {
      const result = await uow.vectorIndexRepository.activateIndexVersion({
        tenantId,
        versionNumber: 2,
        embeddingModel: "text-embedding-3-small",
        embeddingDimension: 1536,
        isActive: true,
      });
      if (!result.ok) throw result.error;
      return result.value;
    });

    expect(v2Result.indexVersionId).toBeDefined();
    expect(v2Result.indexVersionId).not.toBe(v1Result.indexVersionId);

    const activeVersions = await ctx.db.drizzle
      .select()
      .from(indexVersions)
      .where(eq(indexVersions.isActive, true));

    expect(activeVersions).toHaveLength(1);
    expect(Number(activeVersions[0]!.versionNumber)).toBe(2);
  });

  it("records durable error state and retries without duplicating versions or chunks", async () => {
    const uri = `https://example.com/resume-${crypto.randomUUID()}`;
    const sourceResult = await (
      await uowFactory.create()
    ).sourceRepository.create({ type: "url", uri }, tenantId, principalId);
    expect(sourceResult.ok).toBe(true);
    if (!sourceResult.ok) return;

    let attempts = 0;
    const workflow = new IngestionWorkflow(
      uowFactory,
      {
        canParse: () => true,
        parse: async () => ({
          content: "resumable content",
          metadata: {},
          sections: [{ type: "paragraph", content: "resumable content", locators: [] }],
        }),
      },
      {
        chunk: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("transient chunk failure");
          return [
            {
              sequenceNumber: 0,
              content: "resumable content",
              contentHash: "resume-hash",
              locator: { type: "line", path: uri, startLine: 1 },
              createdAt: new Date().toISOString(),
            },
          ];
        },
      },
      { fetch: async () => Buffer.from("resumable content") },
      {
        startActiveSpan: async (_name, fn) =>
          fn({
            setAttribute: () => undefined,
            setStatus: () => undefined,
            end: () => undefined,
            recordException: () => undefined,
          }),
        startSpan: () => ({
          setAttribute: () => undefined,
          setStatus: () => undefined,
          end: () => undefined,
          recordException: () => undefined,
        }),
      },
    );

    await expect(
      workflow.execute({
        sourceUri: uri,
        sourceType: "url",
        tenantId,
        principalId,
      }),
    ).rejects.toThrow("transient chunk failure");
    const [errorState] = await ctx.db.drizzle.select().from(sourceSyncState);
    expect(errorState?.syncStatus).toBe("error");

    const retry = await workflow.execute({
      sourceUri: uri,
      sourceType: "url",
      tenantId,
      principalId,
    });
    expect(retry.status).toBe("created");

    const [finalState] = await ctx.db.drizzle.select().from(sourceSyncState);
    expect(finalState?.syncStatus).toBe("idle");
    expect(await ctx.db.drizzle.select().from(documents)).toHaveLength(1);
    expect(await ctx.db.drizzle.select().from(documentVersions)).toHaveLength(1);
    expect(await ctx.db.drizzle.select().from(chunks)).toHaveLength(1);
  });
});
