import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { sources } from "../schema";
import type { SourceRepository } from "../../../application/ingestion/ports";
import type { Source } from "../../../application/ingestion/ports";
import type { SourceDescriptor } from "../../../domain/documents/types";
import { SourceSchema, mapToSource } from "../../../application/validation";
import { validateOrThrow } from "../../../domain/validation";

export class PostgresSourceRepository implements SourceRepository {
  constructor(private db: Database) {}

  async create(
    descriptor: SourceDescriptor,
    tenantId: string,
    principalId: string,
  ): Promise<{ ok: true; value: Source } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(sources)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          principalId,
          type: descriptor.type,
          uri: descriptor.uri,
          mimeType: descriptor.mimeType,
          metadata: descriptor.metadata,
          isActive: true,
        })
        .returning();
      const mapped = mapToSource(result as Record<string, unknown>);
      const validated = validateOrThrow(SourceSchema, mapped, "Source.create") as unknown as Source;
      return { ok: true, value: validated };
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
      if (!result) return { ok: true, value: null };
      const mapped = mapToSource(result as Record<string, unknown>);
      const validated = validateOrThrow(
        SourceSchema,
        mapped,
        "Source.findById",
      ) as unknown as Source;
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByUri(
    uri: string,
    tenantId: string,
    principalId: string,
  ): Promise<{ ok: true; value: Source | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.uri, uri),
            eq(sources.tenantId, tenantId),
            eq(sources.principalId, principalId),
          ),
        );
      if (!result) return { ok: true, value: null };
      const mapped = mapToSource(result as Record<string, unknown>);
      const validated = validateOrThrow(
        SourceSchema,
        mapped,
        "Source.findByUri",
      ) as unknown as Source;
      return { ok: true, value: validated };
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
        .set(updates as Record<string, unknown>)
        .where(and(eq(sources.id, id), eq(sources.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Source not found") };
      }
      const mapped = mapToSource(result as Record<string, unknown>);
      const validated = validateOrThrow(SourceSchema, mapped, "Source.update") as unknown as Source;
      return { ok: true, value: validated };
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
      const validated = results.map(
        (r) =>
          validateOrThrow(
            SourceSchema,
            mapToSource(r as Record<string, unknown>),
            "Source.list",
          ) as unknown as Source,
      );
      return { ok: true, value: validated };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
