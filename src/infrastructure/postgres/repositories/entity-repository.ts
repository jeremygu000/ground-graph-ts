import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { entities } from "../schema";
import type { EntityRepository } from "../../../application/extraction/ports";
import type { CanonicalEntity } from "../../../domain/knowledge/types";

export class PostgresEntityRepository implements EntityRepository {
  constructor(private db: Database) {}

  async create(
    entity: CanonicalEntity,
  ): Promise<{ ok: true; value: CanonicalEntity } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(entities)
        .values(entity as any)
        .returning();
      return { ok: true, value: result as unknown as CanonicalEntity };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: CanonicalEntity | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(entities)
        .where(and(eq(entities.id, id), eq(entities.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as CanonicalEntity | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByCanonicalName(
    name: string,
    tenantId: string,
  ): Promise<{ ok: true; value: CanonicalEntity | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(entities)
        .where(and(eq(entities.canonicalName, name), eq(entities.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as CanonicalEntity | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByAlias(
    alias: string,
    tenantId: string,
  ): Promise<{ ok: true; value: CanonicalEntity[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entities)
        .where(and(eq(entities.tenantId, tenantId)));
      const filtered = results.filter((e) => (e.aliases as string[]).includes(alias));
      return { ok: true, value: filtered as unknown as CanonicalEntity[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<CanonicalEntity>,
  ): Promise<{ ok: true; value: CanonicalEntity } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(entities)
        .set(updates as any)
        .where(and(eq(entities.id, id), eq(entities.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Entity not found") };
      }
      return { ok: true, value: result as unknown as CanonicalEntity };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async supersede(
    id: string,
    tenantId: string,
    supersededById: string,
  ): Promise<{ ok: true; value: void } | { ok: false; error: Error }> {
    try {
      await this.db.drizzle
        .update(entities)
        .set({ supersededBy: supersededById })
        .where(and(eq(entities.id, id), eq(entities.tenantId, tenantId)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async listByType(
    entityType: string,
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ ok: true; value: CanonicalEntity[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entities)
        .where(and(eq(entities.entityType, entityType), eq(entities.tenantId, tenantId)))
        .limit(limit)
        .offset(offset);
      return { ok: true, value: results as unknown as CanonicalEntity[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async list(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ ok: true; value: CanonicalEntity[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entities)
        .where(eq(entities.tenantId, tenantId))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(entities.createdAt));
      return { ok: true, value: results as unknown as CanonicalEntity[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
