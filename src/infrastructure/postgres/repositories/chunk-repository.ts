import { eq, and, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { chunks } from "../schema";
import type { ChunkRepository } from "../../../application/ingestion/ports";
import type { Chunk } from "../../../domain/documents/types";

export class PostgresChunkRepository implements ChunkRepository {
  constructor(private db: Database) {}

  async create(
    chunk: Omit<Chunk, "id">,
    tenantId: string,
  ): Promise<{ ok: true; value: Chunk } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(chunks)
        .values({
          ...chunk,
          tenantId,
        } as any)
        .returning();
      return { ok: true, value: result as unknown as Chunk };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async createMany(
    chunksToCreate: Omit<Chunk, "id">[],
    tenantId: string,
  ): Promise<{ ok: true; value: Chunk[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .insert(chunks)
        .values(chunksToCreate.map((c) => ({ ...c, tenantId })) as any)
        .returning();
      return { ok: true, value: results as unknown as Chunk[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Chunk | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(chunks)
        .where(and(eq(chunks.id, id), eq(chunks.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as Chunk | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByDocumentVersion(
    documentVersionId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Chunk[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(chunks)
        .where(and(eq(chunks.documentVersionId, documentVersionId), eq(chunks.tenantId, tenantId)))
        .orderBy(chunks.sequenceNumber);
      return { ok: true, value: results as unknown as Chunk[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByIds(
    ids: string[],
    tenantId: string,
  ): Promise<{ ok: true; value: Chunk[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(chunks)
        .where(and(inArray(chunks.id, ids), eq(chunks.tenantId, tenantId)));
      return { ok: true, value: results as unknown as Chunk[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
