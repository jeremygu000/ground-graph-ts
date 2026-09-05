import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { outboxEvents } from "../../src/infrastructure/postgres/schema";
import { PostgresOutboxRepository } from "../../src/infrastructure/postgres/repositories/outbox-repository";
import { hasContainerRuntime, startComponentDatabase } from "./test-support";

const describeComponent = (await hasContainerRuntime()) ? describe : describe.skip;

describeComponent("PostgresOutboxRepository", () => {
  let ctx: Awaited<ReturnType<typeof startComponentDatabase>>;
  let repo: PostgresOutboxRepository;
  const tenantId = crypto.randomUUID();

  beforeAll(async () => {
    ctx = await startComponentDatabase();
    repo = new PostgresOutboxRepository(ctx.db);
  }, 120_000);

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("atomically claims only rows visible to this tenant", async () => {
    const pendingAt = new Date(Date.now() - 1000).toISOString();
    const eventId = crypto.randomUUID();
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "pending",
      attempts: 0,
      availableAt: new Date(pendingAt),
    });

    const result = await repo.claim([eventId], "worker-a", 30_000, tenantId);

    if (!result.ok) {
      throw result.error;
    }
    const claimed = result.value[0]!;
    expect(result.value).toHaveLength(1);
    expect(claimed.status).toBe("claimed");
    expect(claimed.tenantId).toBe(tenantId);
    expect(claimed.claimedBy).toBeDefined();
    expect(claimed.claimedAt).toBeDefined();
    expect(claimed.availableAt).not.toBe(claimed.claimedAt);

    const [stored] = await ctx.db.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    if (!stored) throw new Error("expected stored row");
    expect(stored.status).toBe("claimed");
    expect(stored.tenantId).toBe(tenantId);
  });

  it("does not duplicate claim the same row under concurrency", async () => {
    const eventId = crypto.randomUUID();
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "pending",
      attempts: 0,
      availableAt: new Date(Date.now() - 1000),
    });

    const [first, second] = await Promise.all([
      repo.claim([eventId], "worker-a", 30_000, tenantId),
      repo.claim([eventId], "worker-b", 30_000, tenantId),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok) throw first.error;
    if (!second.ok) throw second.error;

    const lengths = [first.value.length, second.value.length].sort();
    expect(lengths).toEqual([0, 1]);

    const [stored] = await ctx.db.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    if (!stored) throw new Error("expected stored row");
    expect(stored.status).toBe("claimed");
    expect(stored.attempts).toBe(1);
    expect(stored.claimedBy).toBe(first.value.length === 1 ? "worker-a" : "worker-b");
  });

  it("rejects stale complete tokens after the lease expires", async () => {
    const eventId = crypto.randomUUID();
    const claimedAt = new Date(Date.now() - 10_000).toISOString();
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "claimed",
      attempts: 1,
      availableAt: new Date(Date.now() - 1_000),
      claimedAt: new Date(claimedAt),
      claimedBy: "worker-a",
      leaseToken: "token-a",
    });

    const result = await repo.complete(eventId, "token-a", tenantId);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toContain("lease expired");
  });

  it("rejects stale owners after reclaim generates a new token", async () => {
    const eventId = crypto.randomUUID();
    const expiredAt = new Date(Date.now() - 10_000);
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "claimed",
      attempts: 1,
      availableAt: expiredAt,
      claimedAt: expiredAt,
      claimedBy: "worker-a",
      leaseToken: "token-a",
    });

    const reclaimed = await repo.claim([eventId], "worker-b", 30_000, tenantId);
    expect(reclaimed.ok).toBe(true);
    if (!reclaimed.ok) throw reclaimed.error;
    expect(reclaimed.value).toHaveLength(1);

    const freshToken = reclaimed.value[0]!.leaseToken;
    if (!freshToken) throw new Error("expected fresh lease token");

    const staleComplete = await repo.complete(eventId, "token-a", tenantId);
    expect(staleComplete.ok).toBe(false);
    if (staleComplete.ok) throw new Error("expected stale owner failure");
    expect(staleComplete.error.message).toContain("token mismatch");

    const freshComplete = await repo.complete(eventId, freshToken, tenantId);
    expect(freshComplete.ok).toBe(true);
  });

  it("applies deterministic backoff on fail", async () => {
    const eventId = crypto.randomUUID();
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "pending",
      attempts: 0,
      availableAt: new Date(Date.now() - 1_000),
    });

    const claimed = await repo.claim([eventId], "worker-a", 30_000, tenantId);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) throw claimed.error;
    const leaseToken = claimed.value[0]?.leaseToken;
    if (!leaseToken) throw new Error("expected lease token");

    const result = await repo.fail(eventId, leaseToken, "boom", tenantId, 10);

    expect(result.ok, result.ok ? undefined : result.error.message).toBe(true);

    const [stored] = await ctx.db.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    if (!stored) throw new Error("expected stored row");
    expect(stored.status).toBe("pending");
    expect(stored.attempts).toBe(1);
    expect(new Date(stored.availableAt).getTime()).toBeGreaterThan(Date.now());
    expect(stored.error).toContain("boom");
  });

  it("rejects stale fail and deadLetter tokens after reclaim", async () => {
    const eventId = crypto.randomUUID();
    const expiredAt = new Date(Date.now() - 10_000);
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "claimed",
      attempts: 1,
      availableAt: expiredAt,
      claimedAt: expiredAt,
      claimedBy: "worker-a",
      leaseToken: "token-a",
    });

    const reclaimed = await repo.claim([eventId], "worker-b", 30_000, tenantId);
    expect(reclaimed.ok).toBe(true);
    if (!reclaimed.ok) throw reclaimed.error;
    const freshToken = reclaimed.value[0]?.leaseToken;
    if (!freshToken) throw new Error("expected fresh token");

    const staleFail = await repo.fail(eventId, "token-a", "boom", tenantId);
    expect(staleFail.ok).toBe(false);
    if (staleFail.ok) throw new Error("expected stale fail rejection");
    expect(staleFail.error.message).toContain("token mismatch");

    const staleDeadLetter = await repo.deadLetter(eventId, "token-a", "boom", tenantId);
    expect(staleDeadLetter.ok).toBe(false);
    if (staleDeadLetter.ok) throw new Error("expected stale deadLetter rejection");
    expect(staleDeadLetter.error.message).toContain("token mismatch");

    const freshDeadLetter = await repo.deadLetter(eventId, freshToken, "boom", tenantId);
    expect(freshDeadLetter.ok).toBe(true);
  });

  it("dead letters on max attempts", async () => {
    const eventId = crypto.randomUUID();
    await ctx.db.drizzle.insert(outboxEvents).values({
      id: eventId,
      tenantId,
      aggregateType: "document",
      aggregateId: crypto.randomUUID(),
      eventType: "source.created",
      payload: { hello: "world" },
      idempotencyKey: `key-${Date.now()}`,
      status: "pending",
      attempts: 0,
      availableAt: new Date(Date.now() - 1_000),
    });

    const claimed = await repo.claim([eventId], "worker-a", 30_000, tenantId);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) throw claimed.error;
    const leaseToken = claimed.value[0]?.leaseToken;
    if (!leaseToken) throw new Error("expected lease token");

    const result = await repo.fail(eventId, leaseToken, "boom", tenantId, 1);
    expect(result.ok).toBe(true);

    const [stored] = await ctx.db.drizzle
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId));
    if (!stored) throw new Error("expected stored row");
    expect(stored.status).toBe("dead_letter");
    expect(stored.deadLetteredAt).not.toBeNull();
  });
});
