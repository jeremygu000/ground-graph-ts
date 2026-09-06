import { eq, and, desc } from "drizzle-orm";
import type { Database } from "./client";
import { indexVersions } from "./schema";
import type { VectorIndexRepository } from "../../application/ingestion/ports.types";
import type { IndexVersionInfo } from "../../application/models/ports";
import { success, failure, type Result } from "../../domain/result";
import { DatabaseError } from "../../domain/errors";

export class PostgresVectorIndexRepository implements VectorIndexRepository {
  constructor(private readonly db: Database) {}

  async activateIndexVersion(
    info: Omit<IndexVersionInfo, "indexVersionId">,
  ): Promise<Result<IndexVersionInfo>> {
    await this.db.drizzle
      .update(indexVersions)
      .set({ isActive: false })
      .where(
        and(
          eq(indexVersions.tenantId, info.tenantId),
          eq(indexVersions.indexType, "vector"),
          eq(indexVersions.isActive, true),
        ),
      );

    const [row] = await this.db.drizzle
      .insert(indexVersions)
      .values({
        tenantId: info.tenantId,
        indexType: "vector",
        versionNumber: info.versionNumber,
        embeddingModel: info.embeddingModel,
        embeddingDimension: info.embeddingDimension,
        isActive: info.isActive,
      })
      .returning();

    if (!row) {
      return failure(new DatabaseError("Index version row not returned after insert"));
    }

    return success({
      indexVersionId: String(row.id),
      versionNumber: row.versionNumber,
      embeddingModel: row.embeddingModel ?? info.embeddingModel,
      embeddingDimension: row.embeddingDimension ?? info.embeddingDimension,
      isActive: row.isActive,
      tenantId: row.tenantId,
    });
  }

  async getActiveIndexVersion(tenantId: string): Promise<Result<IndexVersionInfo | null>> {
    try {
      const [row] = await this.db.drizzle
        .select()
        .from(indexVersions)
        .where(
          and(
            eq(indexVersions.tenantId, tenantId),
            eq(indexVersions.indexType, "vector"),
            eq(indexVersions.isActive, true),
          ),
        )
        .orderBy(desc(indexVersions.versionNumber))
        .limit(1);

      if (!row) return success(null);
      return success({
        indexVersionId: String(row.id),
        versionNumber: row.versionNumber,
        embeddingModel: row.embeddingModel ?? "",
        embeddingDimension: row.embeddingDimension ?? 0,
        isActive: row.isActive,
        tenantId: row.tenantId,
      });
    } catch (err) {
      return failure(new DatabaseError("Failed to get active index version", err));
    }
  }
}
