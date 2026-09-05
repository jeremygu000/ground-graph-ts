import { eq, and, asc, sql } from "drizzle-orm";
import type { Database } from "../client";
import { outboxEvents } from "../schema";
import type { OutboxEvent, OutboxRepository } from "../../../application/events/ports";

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private db: Database) {}

  async create(
    event: OutboxEvent,
  ): Promise<{ ok: true; value: OutboxEvent } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(outboxEvents)
        .values(event as any)
        .returning();
      return { ok: true, value: result as unknown as OutboxEvent };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findPending(
    tenantId: string,
    limit: number,
  ): Promise<{ ok: true; value: OutboxEvent[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.tenantId, tenantId), eq(outboxEvents.status, "pending")))
        .orderBy(asc(outboxEvents.availableAt))
        .limit(limit);
      return { ok: true, value: results as unknown as OutboxEvent[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async claim(
    ids: string[],
    workerId: string,
    _leaseDurationMs: number,
  ): Promise<{ ok: true; value: OutboxEvent[] } | { ok: false; error: Error }> {
    try {
      const leaseToken = `${workerId}-${Date.now()}`;
      const results = await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "claimed",
          claimedAt: new Date(),
          claimedBy: workerId,
          leaseToken,
          attempts: sql`${outboxEvents.attempts} + 1`,
        } as any)
        .where(and(sql`${outboxEvents.id} = ANY(${ids})`, eq(outboxEvents.status, "pending")))
        .returning();

      return { ok: true, value: results as unknown as OutboxEvent[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async complete(
    id: string,
    token: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "completed",
          completedAt: new Date(),
        } as any)
        .where(and(eq(outboxEvents.id, id), eq(outboxEvents.leaseToken, token)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async fail(
    id: string,
    token: string,
    error: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "pending",
          leaseToken: null,
          claimedBy: null,
          claimedAt: null,
          error: error.substring(0, 500),
        } as any)
        .where(and(eq(outboxEvents.id, id), eq(outboxEvents.leaseToken, token)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async deadLetter(
    id: string,
    token: string,
    error: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "dead_letter",
          deadLetteredAt: new Date(),
          error: error.substring(0, 500),
        } as any)
        .where(and(eq(outboxEvents.id, id), eq(outboxEvents.leaseToken, token)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: OutboxEvent | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(outboxEvents)
        .where(and(eq(outboxEvents.id, id), eq(outboxEvents.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as OutboxEvent | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
