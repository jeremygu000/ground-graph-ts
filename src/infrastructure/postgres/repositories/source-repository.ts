import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { sources } from "../schema";
import type { SourceRepository } from "../../../application/ingestion/ports";
import type { Source } from "../../../application/ingestion/ports";
import type { SourceDescriptor } from "../../../domain/documents/types";

export class PostgresSourceRepository implements SourceRepository {
  constructor(private db: Database) {}

  async create(
    descriptor: SourceDescriptor,
    tenantId: string,
  ): Promise<{ ok: true; value: Source } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(sources)
        .values({
          tenantId,
          type: descriptor.type,
          uri: descriptor.uri,
          mimeType: descriptor.mimeType,
          metadata: descriptor.metadata,
          isActive: true,
        } as any)
        .returning();
      return { ok: true, value: result as unknown as Source };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Source | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(sources)
        .where(and(eq(sources.id, id), eq(sources.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as Source | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByUri(
    uri: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Source | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(sources)
        .where(and(eq(sources.uri, uri), eq(sources.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as Source | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<Source>,
  ): Promise<{ ok: true; value: Source } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(sources)
        .set(updates as any)
        .where(and(eq(sources.id, id), eq(sources.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Source not found") };
      }
      return { ok: true, value: result as unknown as Source };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async deactivate(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(sources)
        .set({ isActive: false })
        .where(and(eq(sources.id, id), eq(sources.tenantId, tenantId)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async list(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ ok: true; value: Source[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(sources)
        .where(eq(sources.tenantId, tenantId))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(sources.createdAt));
      return { ok: true, value: results as unknown as Source[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
