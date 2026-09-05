import { eq, and, asc, sql } from "drizzle-orm";
import type { Database } from "../client";
import { outboxEvents } from "../schema";
import type { OutboxEvent, OutboxRepository } from "../../../application/events/ports";
import { mapToOutboxEvent } from "../../../application/validation";

export class PostgresOutboxRepository implements OutboxRepository {
  constructor(private db: Database) {}

  private mapRows(rows: unknown): OutboxEvent[] {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      return mapToOutboxEvent({
        id: record.id,
        tenantId: record.tenantId ?? record.tenant_id,
        aggregateType: record.aggregateType ?? record.aggregate_type,
        aggregateId: record.aggregateId ?? record.aggregate_id,
        eventType: record.eventType ?? record.event_type,
        payload: record.payload,
        idempotencyKey: record.idempotencyKey ?? record.idempotency_key,
        status: record.status,
        attempts: record.attempts,
        availableAt: record.availableAt ?? record.available_at,
        claimedAt: record.claimedAt ?? record.claimed_at,
        claimedBy: record.claimedBy ?? record.claimed_by,
        leaseToken: record.leaseToken ?? record.lease_token,
        completedAt: record.completedAt ?? record.completed_at,
        deadLetteredAt: record.deadLetteredAt ?? record.dead_lettered_at,
        error: record.error,
        createdAt: record.createdAt ?? record.created_at,
        updatedAt: record.updatedAt ?? record.updated_at,
      }) as OutboxEvent;
    });
  }

  private normalizeResultRows(result: unknown): Record<string, unknown>[] {
    if (Array.isArray(result)) {
      return result as Record<string, unknown>[];
    }
    if (
      result &&
      typeof result === "object" &&
      "rows" in result &&
      Array.isArray((result as { rows?: unknown }).rows)
    ) {
      return (result as { rows: Record<string, unknown>[] }).rows;
    }
    return [];
  }

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
      return {
        ok: true,
        value: mapToOutboxEvent(result as Record<string, unknown>) as OutboxEvent,
      };
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
      return {
        ok: true,
        value: results.map((r) => mapToOutboxEvent(r as Record<string, unknown>) as OutboxEvent),
      };
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
      const claimTime = new Date().toISOString();
      const claimUntil = new Date(Date.now() + leaseDurationMs).toISOString();

      const rows = await this.db.drizzle.transaction(async (tx) => {
        const selectedRows = this.normalizeResultRows(
          await tx.execute(sql`
            SELECT id
            FROM outbox_events
            WHERE tenant_id = ${tenantId}
              AND (${sql.join(ids.map((id) => sql`${outboxEvents.id} = ${id}::uuid`), sql` OR `)})
              AND (
                status = 'pending'
                OR (status = 'claimed' AND available_at < NOW())
              )
            ORDER BY available_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
          `),
        );

        const selectedIds = selectedRows.map((row) => String(row.id));
        if (selectedIds.length === 0) return [];

        const result = await tx.execute(sql`
          UPDATE outbox_events
          SET
            status = 'claimed',
            claimed_at = ${claimTime}::timestamptz,
            claimed_by = ${workerId},
            lease_token = ${leaseToken},
            attempts = attempts + 1,
            available_at = ${claimUntil}::timestamptz
          WHERE (${sql.join(
            selectedIds.map((id) => sql`${outboxEvents.id} = ${id}::uuid`),
            sql` OR `,
          )})
          RETURNING *
        `);
        return this.normalizeResultRows(result);
      });

      return { ok: true, value: this.mapRows(rows) };
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
        .update(outboxEvents)
        .set({
          error: errorMessage.substring(0, 500),
        })
        .where(
          and(
            eq(outboxEvents.id, id),
            tenantId ? eq(outboxEvents.tenantId, tenantId) : sql`TRUE`,
            eq(outboxEvents.leaseToken, token),
            eq(outboxEvents.status, "claimed"),
            sql`${outboxEvents.availableAt} >= NOW()`,
          ),
        )
        .returning();

      if (!result) {
        return {
          ok: false,
          error: new Error("Event not found, not claimed, lease expired, or token mismatch"),
        };
      }

      const attempts = Number(result.attempts);
      const shouldDeadLetter = maxAttempts !== undefined && attempts >= maxAttempts;

      if (shouldDeadLetter) {
        const [dl] = await this.db.drizzle
          .update(outboxEvents)
          .set({
            status: "dead_letter",
            deadLetteredAt: new Date(),
            error: errorMessage.substring(0, 500),
          })
          .where(
            and(
              eq(outboxEvents.id, id),
              tenantId ? eq(outboxEvents.tenantId, tenantId) : sql`TRUE`,
              eq(outboxEvents.leaseToken, token),
            ),
          )
          .returning({ id: outboxEvents.id });
        if (!dl) {
          return { ok: false, error: new Error("Failed to dead-letter event") };
        }
      } else {
        const backoffMs = Math.pow(2, Math.max(0, attempts - 1)) * 1000;
        const nextAvailableAt = new Date(Date.now() + backoffMs);

        const [updated] = await this.db.drizzle
          .update(outboxEvents)
          .set({
            status: "pending",
            leaseToken: null,
            claimedBy: null,
            claimedAt: null,
            availableAt: nextAvailableAt,
            error: errorMessage.substring(0, 500),
          })
          .where(
            and(
              eq(outboxEvents.id, id),
              tenantId ? eq(outboxEvents.tenantId, tenantId) : sql`TRUE`,
              eq(outboxEvents.leaseToken, token),
            ),
          )
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
      return {
        ok: true,
        value: mapToOutboxEvent(result as Record<string, unknown>) as OutboxEvent,
      };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
