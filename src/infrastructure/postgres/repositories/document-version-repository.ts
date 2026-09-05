import { eq, and, desc } from "drizzle-orm";
import type { Database } from "../client";
import { documentVersions } from "../schema";
import type {
  DocumentVersionRepository,
  DocumentVersion,
  CreateDocumentVersionInput,
} from "../../../application/ingestion/ports";
import { mapToDocumentVersion } from "../../../application/validation";

export class PostgresDocumentVersionRepository implements DocumentVersionRepository {
  constructor(private db: Database) {}

  async create(
    documentId: string,
    version: CreateDocumentVersionInput,
  ): Promise<{ ok: true; value: DocumentVersion } | { ok: false; error: Error }> {
    try {
      const insertData: typeof documentVersions.$inferInsert = {
        documentId,
        tenantId: version.tenantId,
        principalId: version.principalId,
        versionNumber: version.versionNumber,
        contentHash: version.contentHash,
        checksum: version.checksum,
        sizeBytes: version.sizeBytes,
        parsedDocument: version.parsedDocument,
        isActive: version.isActive,
        createdBy: version.createdBy,
      };
      if (version.id) {
        insertData.id = version.id;
      }
      const [result] = await this.db.drizzle
        .insert(documentVersions)
        .values(insertData)
        .returning();
      return {
        ok: true,
        value: mapToDocumentVersion(result as Record<string, unknown>),
      };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findById(
    id: string,
    tenantId: string,
  ): Promise<{ ok: true; value: DocumentVersion | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.id, id), eq(documentVersions.tenantId, tenantId)));
      if (!result) return { ok: true, value: null };
      return {
        ok: true,
        value: mapToDocumentVersion(result as Record<string, unknown>),
      };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async findLatest(
    documentId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: DocumentVersion | null } | { ok: false; error: Error }> {
    try {
      const [result] = await this.db.drizzle
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.tenantId, tenantId),
            eq(documentVersions.isActive, true),
          ),
        )
        .orderBy(desc(documentVersions.versionNumber))
        .limit(1);
      if (!result) return { ok: true, value: null };
      return {
        ok: true,
        value: mapToDocumentVersion(result as Record<string, unknown>),
      };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }

  async listByDocument(
    documentId: string,
    tenantId: string,
  ): Promise<{ ok: true; value: DocumentVersion[] } | { ok: false; error: Error }> {
    try {
      const results = await this.db.drizzle
        .select()
        .from(documentVersions)
        .where(
          and(eq(documentVersions.documentId, documentId), eq(documentVersions.tenantId, tenantId)),
        )
        .orderBy(desc(documentVersions.versionNumber));
      return {
        ok: true,
        value: results.map((r) => mapToDocumentVersion(r as Record<string, unknown>)),
      };
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
        .update(documentVersions)
        .set({ isActive: false })
        .where(and(eq(documentVersions.id, id), eq(documentVersions.tenantId, tenantId)));
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: error as Error };
    }
  }
}
