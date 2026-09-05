import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { documents } from "../schema";
import type {
  DocumentRepository,
  Document,
  CreateDocumentInput,
} from "../../../application/ingestion/ports";

export class PostgresDocumentRepository implements DocumentRepository {
  constructor(private db: Database) {}

  async create(
    document: CreateDocumentInput,
    tenantId: string,
    principalId: string,
  ): Promise<{ ok: true; value: Document } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .insert(documents)
        .values({
          tenantId,
          principalId,
          sourceId: document.sourceId,
          title: document.title,
          metadata: document.metadata,
          isActive: true,
        })
        .returning();
      return { ok: true, value: result as unknown as Document };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Document | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(documents)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as Document | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findBySourceId(
    sourceId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: Document | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(documents)
        .where(and(eq(documents.sourceId, sourceId), eq(documents.tenantId, tenantId)));
      return { ok: true, value: (result ?? null) as unknown as Document | null };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<Document>,
  ): Promise<{ ok: true; value: Document } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .update(documents)
        .set(updates as any)
        .where(and(eq(documents.id, id), eq(documents.tenantId, tenantId)))
        .returning();
      if (!result) {
        return { ok: false, error: new Error("Document not found") };
      }
      return { ok: true, value: result as unknown as Document };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async list(
    tenantId: string,
    limit = 100,
    offset = 0,
  ): Promise<{ ok: true; value: Document[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(documents)
        .where(eq(documents.tenantId, tenantId))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(documents.createdAt));
      return { ok: true, value: results as unknown as Document[] };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
