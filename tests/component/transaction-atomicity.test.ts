import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { outboxEvents, sources } from "../../src/infrastructure/postgres/schema";
import { DefaultUnitOfWorkFactory } from "../../src/infrastructure/unit-of-work";
import { hasContainerRuntime, startComponentDatabase } from "./test-support";

const describeComponent = (await hasContainerRuntime()) ? describe : describe.skip;

describeComponent("TransactionalUnitOfWork", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let uowFactory: DefaultUnitOfWorkFactory;
  const tenantId = crypto.randomUUID();

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
        const sourceResult = await uow.sourceRepository.create({ type: "url", uri }, tenantId);
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
      const sourceResult = await uow.sourceRepository.create({ type: "url", uri }, tenantId);
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
});
