import { eq, and, asc, sql } from "drizzle-orm";
import type { Database } from "../client";
import { outboxEvents } from "../schema";
import type { OutboxEvent, OutboxRepository } from "../../../application/events/ports";
import { mapToOutboxEvent } from "../../../application/validation";

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private db: Database) {}

  async create(
    event: OutboxEvent,
  ): Promise<{ ok: true; value: OutboxEvent } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(outboxEvents)
        .values({
          id: event.id,
          tenantId: event.tenantId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          payload: event.payload,
          idempotencyKey: event.idempotencyKey,
          status: event.status,
          attempts: event.attempts,
          availableAt: new Date(event.availableAt),
          claimedAt: event.claimedAt ? new Date(event.claimedAt) : undefined,
          claimedBy: event.claimedBy,
          leaseToken: event.leaseToken,
          completedAt: event.completedAt ? new Date(event.completedAt) : undefined,
          deadLetteredAt: event.deadLetteredAt ? new Date(event.deadLetteredAt) : undefined,
          error: event.error,
        })
        .returning();
      const mapped = mapToOutboxEvent(result as Record<string, unknown>);
      return { ok: true, value: mapped as OutboxEvent };
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
        .where(
          and(
            eq(outboxEvents.tenantId, tenantId),
            sql`(
              (${outboxEvents.status} = 'pending' AND ${outboxEvents.availableAt} <= NOW())
              OR
              (${outboxEvents.status} = 'claimed' AND ${outboxEvents.availableAt} < NOW())
            )`,
          ),
        )
        .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.id))
        .limit(limit);
      const mapped = results.map((r) => mapToOutboxEvent(r as Record<string, unknown>));
      return { ok: true, value: mapped as OutboxEvent[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async claim(
    ids: string[],
    workerId: string,
    leaseDurationMs: number,
    tenantId: string,
  ): Promise<{ ok: true; value: OutboxEvent[] } | { ok: false; error: Error }> {
    try {
      const leaseToken = `${workerId}-${Date.now()}-${crypto.randomUUID()}`;
      const claimTime = new Date();
      const claimUntil = new Date(Date.now() + leaseDurationMs);
      const idArray = ids;

      const rows = await this.db.drizzle.transaction(async (tx) => {
        const cte = sql`
          WITH selected AS (
            SELECT id
            FROM outbox_events
            WHERE ${outboxEvents.id} = ANY(${idArray})
              AND ${outboxEvents.tenantId} = ${tenantId}
              AND (${outboxEvents.status} = 'pending' OR (${outboxEvents.status} = 'claimed' AND ${outboxEvents.availableAt} < NOW()))
              FOR UPDATE SKIP LOCKED
            ORDER BY ${outboxEvents.availableAt} ASC, ${outboxEvents.id} ASC
          )
          UPDATE outbox_events
          SET
            status = 'claimed',
            claimed_at = ${claimTime},
            claimed_by = ${workerId},
            lease_token = ${leaseToken},
            attempts = ${outboxEvents.attempts} + 1,
            available_at = ${claimUntil}
          FROM selected
          WHERE selected.id = outbox_events.id
          RETURNING outbox_events.*
        `;
        const result = await tx.execute(cte);
        return result;
      });

      const mapped = (rows as Record<string, unknown>[]).map((r) => mapToOutboxEvent(r));
      return { ok: true, value: mapped as OutboxEvent[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async complete(
    id: string,
    token: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(
          and(
            eq(outboxEvents.id, id),
            eq(outboxEvents.tenantId, tenantId),
            eq(outboxEvents.leaseToken, token),
            eq(outboxEvents.status, "claimed"),
            sql`${outboxEvents.availableAt} >= NOW()`,
          ),
        )
        .returning({ id: outboxEvents.id });

      if (!result) {
        return {
          ok: false,
          error: new Error("Event not found, not claimed, lease expired, or token mismatch"),
        };
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async fail(
    id: string,
    token: string,
    errorMessage: string,
    maxAttempts?: number,
    tenantId?: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.id, id),
            tenantId ? eq(outboxEvents.tenantId, tenantId) : undefined,
            eq(outboxEvents.leaseToken, token),
            eq(outboxEvents.status, "claimed"),
            sql`${outboxEvents.availableAt} >= NOW()`,
          ),
        )
        .for("update");

      if (!result) {
        return {
          ok: false,
          error: new Error("Event not found, not claimed, lease expired, or token mismatch"),
        };
      }

      const attempts = Number(result.attempts) + 1;
      const shouldDeadLetter = maxAttempts !== undefined && attempts >= maxAttempts;

      if (shouldDeadLetter) {
        const [dl] = await this.db.drizzle
          .update(outboxEvents)
          .set({
            status: "dead_letter",
            deadLetteredAt: new Date(),
            error: errorMessage.substring(0, 500),
          })
          .where(eq(outboxEvents.id, id))
          .returning({ id: outboxEvents.id });
        if (!dl) {
          return { ok: false, error: new Error("Failed to dead-letter event") };
        }
      } else {
        const backoffMs = Math.pow(2, attempts) * 1000;
        const nextAvailableAt = new Date(Date.now() + backoffMs);

        const [updated] = await this.db.drizzle
          .update(outboxEvents)
          .set({
            status: "pending",
            leaseToken: null,
            claimedBy: null,
            claimedAt: null,
            availableAt: nextAvailableAt,
            attempts,
            error: errorMessage.substring(0, 500),
          })
          .where(eq(outboxEvents.id, id))
          .returning({ id: outboxEvents.id });
        if (!updated) {
          return { ok: false, error: new Error("Failed to reset event") };
        }
      }

      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async deadLetter(
    id: string,
    token: string,
    errorMessage: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(outboxEvents)
        .set({
          status: "dead_letter",
          deadLetteredAt: new Date(),
          error: errorMessage.substring(0, 500),
        })
        .where(
          and(
            eq(outboxEvents.id, id),
            eq(outboxEvents.tenantId, tenantId),
            eq(outboxEvents.leaseToken, token),
            eq(outboxEvents.status, "claimed"),
            sql`${outboxEvents.availableAt} >= NOW()`,
          ),
        )
        .returning({ id: outboxEvents.id });

      if (!result) {
        return {
          ok: false,
          error: new Error("Event not found, not claimed, lease expired, or token mismatch"),
        };
      }
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
      if (!result) return { ok: true, value: null };
      const mapped = mapToOutboxEvent(result as Record<string, unknown>);
      return { ok: true, value: mapped as OutboxEvent };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
