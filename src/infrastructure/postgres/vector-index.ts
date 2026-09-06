import { eq, and, sql, inArray, asc, desc } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";
import type { Database } from "./client";
import { chunkEmbeddings, chunks, documents, indexVersions } from "./schema";
import type { Chunk } from "../../domain/documents/types";
import { success, failure, type Result } from "../../domain/result";
import { DatabaseError, ValidationError } from "../../domain/errors";
import type {
  IndexVersionInfo,
  VectorIndexPort,
  VectorSearchOptions,
  VectorSearchResultRow,
} from "../../application/models/ports";
import { withSpan } from "../telemetry";
import { mapToChunk } from "../../application/validation";

const EMBEDDING_DIMENSION = 1536;

const vectorType = customType<{ data: number[]; driverData: string }>({
  dataType: () => `vector(${EMBEDDING_DIMENSION})`,
});

function toPgVectorLiteral(values: number[]): string {
  return `[${values.map((v) => v.toString()).join(",")}]`;
}

export class PostgresVectorIndexAdapter implements VectorIndexPort {
  constructor(private readonly db: Database) {}

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
      return failure(new DatabaseError("Failed to load active index version", err));
    }
  }

  async upsertEmbeddings(
    chunksToEmbed: Chunk[],
    embeddings: number[][],
    indexVersionId: string,
    tenantId: string,
  ): Promise<Result<{ upserted: number; indexVersionId: string }>> {
    if (chunksToEmbed.length !== embeddings.length) {
      return failure(
        new ValidationError("Chunks and embeddings count mismatch", {
          chunks: chunksToEmbed.length,
          embeddings: embeddings.length,
        }),
      );
    }
    for (let i = 0; i < embeddings.length; i++) {
      const e = embeddings[i];
      if (!e || e.length !== EMBEDDING_DIMENSION) {
        return failure(
          new ValidationError(
            `Embedding at index ${i} has invalid dimension ${e?.length ?? "undefined"}`,
            { expected: EMBEDDING_DIMENSION },
          ),
        );
      }
    }
    return withSpan(
      "vector.upsertEmbeddings",
      async () => {
        try {
          const values = chunksToEmbed.map((chunk, i) => ({
            chunkId: chunk.id,
            indexVersionId,
            tenantId,
            principalId: chunk.principalId,
            embedding: embeddings[i] ?? [],
          }));
          const result = await this.db.drizzle
            .insert(chunkEmbeddings)
            .values(values)
            .onConflictDoUpdate({
              target: [chunkEmbeddings.chunkId, chunkEmbeddings.indexVersionId],
              set: { embedding: sql`EXCLUDED.embedding` },
            });
          const inserted = chunksToEmbed.length;
          void result;
          return success({ upserted: inserted, indexVersionId });
        } catch (err) {
          return failure(new DatabaseError("Failed to upsert embeddings", err));
        }
      },
      {
        attributes: {
          "vector.tenant_id": tenantId,
          "vector.index_version_id": indexVersionId,
          "vector.count": String(chunksToEmbed.length),
        },
      },
    );
  }

  async search(
    queryEmbedding: number[],
    tenantId: string,
    options: VectorSearchOptions,
  ): Promise<Result<VectorSearchResultRow[]>> {
    if (queryEmbedding.length !== EMBEDDING_DIMENSION) {
      return failure(
        new ValidationError(`Query embedding has invalid dimension ${queryEmbedding.length}`, {
          expected: EMBEDDING_DIMENSION,
        }),
      );
    }
    return withSpan(
      "vector.search",
      async () => {
        try {
          const limit = options.limit ?? 20;
          const minScore = options.minScore ?? 0;
          const indexVersionId = options.indexVersionId;
          if (!indexVersionId) {
            return failure(new ValidationError("Vector search requires an indexVersionId"));
          }
          const conditions = [
            sql`${chunkEmbeddings.tenantId} = ${tenantId}`,
            sql`${chunkEmbeddings.indexVersionId} = ${indexVersionId}`,
            sql`${chunks.tenantId} = ${tenantId}`,
            sql`${chunkEmbeddings.embedding} <=> ${toPgVectorLiteral(queryEmbedding)}::vector <= ${1 - minScore}`,
          ];
          if (options.filter?.documentIds && options.filter.documentIds.length > 0) {
            conditions.push(inArray(documents.id, options.filter.documentIds));
          }
          if (options.filter?.chunkIds && options.filter.chunkIds.length > 0) {
            conditions.push(inArray(chunks.id, options.filter.chunkIds));
          }
          if (options.filter?.principalId && options.filter.principalId.length > 0) {
            conditions.push(inArray(chunks.principalId, options.filter.principalId));
          }
          const distance = sql<number>`${chunkEmbeddings.embedding} <=> ${toPgVectorLiteral(queryEmbedding)}::vector`;
          const score = sql<number>`1 - ${distance}`;
          const rows = await this.db.drizzle
            .select({
              chunkId: chunks.id,
              documentVersionId: chunks.documentVersionId,
              documentId: documents.id,
              content: chunks.content,
              locator: chunks.locator,
              metadata: chunks.metadata,
              score,
              indexVersionId: chunkEmbeddings.indexVersionId,
            })
            .from(chunkEmbeddings)
            .innerJoin(chunks, sql`${chunks.id} = ${chunkEmbeddings.chunkId}`)
            .innerJoin(
              sql`document_versions`,
              sql`document_versions.id = ${chunks.documentVersionId}`,
            )
            .innerJoin(documents, sql`${documents.id} = document_versions.document_id`)
            .where(and(...conditions))
            .orderBy(asc(distance))
            .limit(limit);
          return success(
            rows.map((row) => ({
              chunkId: String(row.chunkId),
              documentVersionId: String(row.documentVersionId),
              documentId: String(row.documentId),
              content: String(row.content ?? ""),
              locator: (row.locator as Record<string, unknown> | null) ?? {},
              metadata: (row.metadata as Record<string, unknown> | null) ?? {},
              score: clamp01(Number(row.score)),
              indexVersionId: String(row.indexVersionId),
              embeddingModel: "",
            })),
          );
        } catch (err) {
          return failure(new DatabaseError("Vector search failed", err));
        }
      },
      {
        attributes: {
          "vector.tenant_id": tenantId,
          "vector.limit": String(options.limit ?? 20),
        },
      },
    );
  }

  async deleteByDocumentVersion(
    documentVersionId: string,
    tenantId: string,
  ): Promise<Result<{ deleted: number }>> {
    try {
      const chunkRows = await this.db.drizzle
        .select({ id: chunks.id })
        .from(chunks)
        .where(and(eq(chunks.documentVersionId, documentVersionId), eq(chunks.tenantId, tenantId)));
      const chunkIds = chunkRows.map((r) => String(r.id));
      if (chunkIds.length === 0) {
        return success({ deleted: 0 });
      }
      const result = await this.db.drizzle
        .delete(chunkEmbeddings)
        .where(
          and(inArray(chunkEmbeddings.chunkId, chunkIds), eq(chunkEmbeddings.tenantId, tenantId)),
        );
      const deleted = (result as unknown as { rowCount?: number }).rowCount ?? chunkIds.length;
      return success({ deleted });
    } catch (err) {
      return failure(new DatabaseError("Failed to delete embeddings by document version", err));
    }
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export { EMBEDDING_DIMENSION, vectorType };
export { mapToChunk };
