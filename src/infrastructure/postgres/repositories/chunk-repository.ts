import { eq, and, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { chunks } from "../schema";
import type { ChunkRepository } from "../../../application/ingestion/ports";
import type { Chunk } from "../../../domain/documents/types";
import { mapToChunk } from "../../../application/validation";

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
          documentVersionId: chunk.documentVersionId,
          tenantId,
          sequenceNumber: chunk.sequenceNumber,
          content: chunk.content,
          contentHash: chunk.contentHash,
          locator: chunk.locator,
          metadata: chunk.metadata,
        })
        .returning();
      return { ok: true, value: mapToChunk(result as Record<string, unknown>) };
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
        .values(
          chunksToCreate.map((c) => ({
            documentVersionId: c.documentVersionId,
            tenantId,
            sequenceNumber: c.sequenceNumber,
            content: c.content,
            contentHash: c.contentHash,
            locator: c.locator,
            metadata: c.metadata,
          })),
        )
        .returning();
      return { ok: true, value: results.map((r) => mapToChunk(r as Record<string, unknown>)) };
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
      if (!result) return { ok: true, value: null };
      return { ok: true, value: mapToChunk(result as Record<string, unknown>) };
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
      return { ok: true, value: results.map((r) => mapToChunk(r as Record<string, unknown>)) };
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
      return { ok: true, value: results.map((r) => mapToChunk(r as Record<string, unknown>)) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
