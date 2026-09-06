import { and, eq } from "drizzle-orm";
import type { Database } from "../client";
import { sourceSyncState } from "../schema";
import type {
  SourceSyncState,
  SourceSyncStateRepository,
} from "../../../application/ingestion/ports.types";
import { z } from "zod";

const SourceSyncStateSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  tenantId: z.string().uuid(),
  lastCursor: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  lastChangeHash: z.string().optional(),
  syncStatus: z.enum(["idle", "syncing", "error"]),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function mapState(row: Record<string, unknown>): SourceSyncState {
  return SourceSyncStateSchema.parse({
    id: String(row.id),
    sourceId: String(row.sourceId),
    tenantId: String(row.tenantId),
    ...(row.lastCursor != null ? { lastCursor: String(row.lastCursor) } : {}),
    ...(row.lastSyncedAt != null
      ? { lastSyncedAt: new Date(String(row.lastSyncedAt)).toISOString() }
      : {}),
    ...(row.lastChangeHash != null ? { lastChangeHash: String(row.lastChangeHash) } : {}),
    syncStatus: String(row.syncStatus),
    ...(row.errorMessage != null ? { errorMessage: String(row.errorMessage) } : {}),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }) as SourceSyncState;
}

export class PostgresSourceSyncStateRepository implements SourceSyncStateRepository {
  constructor(private db: Database) {}

  async create(
    state: SourceSyncState,
  ): Promise<{ ok: true; value: SourceSyncState } | { ok: false; error: Error }> {
    try {
      const [row] = await this.db.drizzle
        .insert(sourceSyncState)
        .values({
          id: state.id,
          sourceId: state.sourceId,
          tenantId: state.tenantId,
          lastCursor: state.lastCursor,
          lastSyncedAt: state.lastSyncedAt ? new Date(state.lastSyncedAt) : undefined,
          lastChangeHash: state.lastChangeHash,
          syncStatus: state.syncStatus,
          errorMessage: state.errorMessage,
        })
        .returning();
      return { ok: true, value: mapState(row as unknown as Record<string, unknown>) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findBySourceId(sourceId: string, tenantId: string) {
    try {
      const [row] = await this.db.drizzle
        .select()
        .from(sourceSyncState)
        .where(and(eq(sourceSyncState.sourceId, sourceId), eq(sourceSyncState.tenantId, tenantId)));
      return {
        ok: true as const,
        value: row ? mapState(row as unknown as Record<string, unknown>) : null,
      };
    } catch (error) {
      return { ok: false as const, error: error as Error };
    }
  }

  async update(sourceId: string, tenantId: string, updates: Partial<SourceSyncState>) {
    try {
      const [row] = await this.db.drizzle
        .update(sourceSyncState)
        .set({
          ...(updates.lastCursor !== undefined ? { lastCursor: updates.lastCursor } : {}),
          ...(updates.lastSyncedAt !== undefined
            ? { lastSyncedAt: updates.lastSyncedAt ? new Date(updates.lastSyncedAt) : null }
            : {}),
          ...(updates.lastChangeHash !== undefined
            ? { lastChangeHash: updates.lastChangeHash }
            : {}),
          ...(updates.syncStatus !== undefined ? { syncStatus: updates.syncStatus } : {}),
          ...(updates.errorMessage !== undefined ? { errorMessage: updates.errorMessage } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(sourceSyncState.sourceId, sourceId), eq(sourceSyncState.tenantId, tenantId)))
        .returning();
      if (!row) return { ok: false as const, error: new Error("Source sync state not found") };
      return { ok: true as const, value: mapState(row as unknown as Record<string, unknown>) };
    } catch (error) {
      return { ok: false as const, error: error as Error };
    }
  }
}
