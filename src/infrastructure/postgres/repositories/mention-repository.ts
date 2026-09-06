import { eq, and, isNull, desc } from "drizzle-orm";
import type { Database } from "../client";
import { entityMentions } from "../schema";
import type { MentionRepository } from "../../../application/extraction/ports.types";
import type { EntityMention } from "../../../domain/knowledge/knowledge.schema";
import { mapMentionRow } from "../mappers/mention.mapper";

export class PostgresMentionRepository implements MentionRepository {
  constructor(private db: Database) {}

  async create(
    mention: EntityMention,
  ): Promise<{ ok: true; value: EntityMention } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(entityMentions)
        .values({
          id: mention.id,
          tenantId: mention.tenantId,
          mentionText: mention.mentionText,
          normalizedForm: mention.normalizedForm,
          entityId: mention.entityId,
          sourceChunkId: mention.sourceChunkId,
          position: mention.position,
          confidence: mention.confidence.toString(),
          createdAt: new Date(mention.createdAt),
        } as any)
        .returning();
      return { ok: true, value: this.mapToDomain(result!) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async createMany(
    mentions: EntityMention[],
  ): Promise<{ ok: true; value: EntityMention[] } | { ok: false; error: Error }> {
    try {
      if (mentions.length === 0) {
        return { ok: true, value: [] };
      }
      const values = mentions.map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        mentionText: m.mentionText,
        normalizedForm: m.normalizedForm,
        entityId: m.entityId,
        sourceChunkId: m.sourceChunkId,
        position: m.position,
        confidence: m.confidence.toString(),
        createdAt: new Date(m.createdAt),
      }));
      const results = await this.db.drizzle.insert(entityMentions).values(values).returning();
      return { ok: true, value: results.map((r) => this.mapToDomain(r)) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByChunk(
    chunkId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: EntityMention[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entityMentions)
        .where(
          and(eq(entityMentions.sourceChunkId, chunkId), eq(entityMentions.tenantId, tenantId)),
        );
      return { ok: true, value: results.map((r) => this.mapToDomain(r)) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findByEntity(
    entityId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: EntityMention[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entityMentions)
        .where(and(eq(entityMentions.entityId, entityId), eq(entityMentions.tenantId, tenantId)));
      return { ok: true, value: results.map((r) => this.mapToDomain(r)) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findUnresolved(
    tenantId: string,
    limit = 100,
  ): Promise<{ ok: true; value: EntityMention[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(entityMentions)
        .where(and(eq(entityMentions.tenantId, tenantId), isNull(entityMentions.entityId)))
        .limit(limit)
        .orderBy(desc(entityMentions.createdAt));
      return { ok: true, value: results.map((r) => this.mapToDomain(r)) };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  private mapToDomain(row: typeof entityMentions.$inferSelect): EntityMention {
    return mapMentionRow(row as Record<string, unknown>);
  }
}
