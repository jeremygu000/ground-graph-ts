import { sql, eq, and, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { chunks, documents, documentVersions, sources } from "./schema";
import type {
  FullTextSearchOptions,
  FullTextSearchPort,
  FullTextSearchResultRow,
} from "../../application/models/models.types";
import { success, failure, type Result } from "../../domain/result";
import { DatabaseError, ValidationError } from "../../domain/errors";
import { withSpan } from "../telemetry";
import { tokenize } from "../models/rerank-adapter";

const MAX_FULLTEXT_LIMIT = 100;

export class PostgresFullTextSearchAdapter implements FullTextSearchPort {
  constructor(private readonly db: Database) {}

  async search(
    query: string,
    tenantId: string,
    options: FullTextSearchOptions,
  ): Promise<Result<FullTextSearchResultRow[]>> {
    if (!query || query.trim().length === 0) {
      return failure(new ValidationError("Full-text query cannot be empty"));
    }
    const language = options.language ?? "english";
    const limit = clamp(options.limit ?? 20, 1, MAX_FULLTEXT_LIMIT);
    return withSpan(
      "fulltext.search",
      async () => {
        try {
          const tsQuery = buildTsQuery(query, language);
          if (!tsQuery) {
            return success([]);
          }
          const conditions = [
            sql`${chunks.tenantId} = ${tenantId}`,
            eq(documentVersions.isActive, true),
            eq(documents.isActive, true),
            eq(sources.isActive, true),
            sql`to_tsvector(${language}, coalesce(${chunks.content}, '')) @@ to_tsquery(${language}, ${tsQuery})`,
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
          const rank = sql<number>`ts_rank_cd(to_tsvector(${language}, coalesce(${chunks.content}, '')), to_tsquery(${language}, ${tsQuery}))`;
          const headline = sql<string>`ts_headline(
            ${language},
            ${chunks.content},
            to_tsquery(${language}, ${tsQuery}),
            'MaxFragments=1, MinWords=5, MaxWords=20, ShortWord=2, StartSel=[HL], StopSel=[/HL]'
          )`;
          const rows = await this.db.drizzle
            .select({
              chunkId: chunks.id,
              documentVersionId: chunks.documentVersionId,
              documentId: documents.id,
              content: chunks.content,
              locator: chunks.locator,
              metadata: chunks.metadata,
              rank,
              headline,
            })
            .from(chunks)
            .innerJoin(documentVersions, eq(documentVersions.id, chunks.documentVersionId))
            .innerJoin(documents, eq(documents.id, documentVersions.documentId))
            .innerJoin(sources, eq(sources.id, documents.sourceId))
            .where(and(...conditions))
            .orderBy(sql`${rank} DESC`)
            .limit(limit);
          const maxRank = rows.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0);
          const mapped: FullTextSearchResultRow[] = rows.map((row) => {
            const rankValue = Number(row.rank) || 0;
            const normalizedScore = maxRank > 0 ? rankValue / maxRank : 0;
            return {
              chunkId: String(row.chunkId),
              documentVersionId: String(row.documentVersionId),
              documentId: String(row.documentId),
              content: String(row.content ?? ""),
              locator: (row.locator as Record<string, unknown> | null) ?? {},
              metadata: (row.metadata as Record<string, unknown> | null) ?? {},
              score: clamp01(normalizedScore),
              rank: rankValue,
              headline: String(row.headline ?? row.content ?? ""),
            };
          });
          return success(mapped);
        } catch (err) {
          return failure(new DatabaseError("Full-text search failed", err));
        }
      },
      {
        attributes: {
          "fulltext.tenant_id": tenantId,
          "fulltext.limit": String(limit),
        },
      },
    );
  }

  async rebuildIndex(
    tenantId: string,
    _documentVersionIds: string[],
  ): Promise<Result<{ rebuilt: number }>> {
    try {
      const rows = await this.db.drizzle
        .select({ id: chunks.id })
        .from(chunks)
        .where(eq(chunks.tenantId, tenantId));
      return success({ rebuilt: rows.length });
    } catch (err) {
      return failure(new DatabaseError("Failed to rebuild full-text index", err));
    }
  }
}

export function buildTsQuery(query: string, _language: string): string {
  const tokens = tokenize(query).filter((t) => t.length > 1);
  if (tokens.length === 0) return "";
  return tokens
    .map((t) => sanitize(t))
    .filter((t) => t.length > 0)
    .join(" & ");
}

const DANGEROUS_TOKENS = new Set(["admin", "root", "superuser", "sysadmin"]);

export function sanitize(token: string): string {
  const normalized = token.replace(/[^a-z0-9]/gi, "").toLowerCase();
  for (const dangerous of DANGEROUS_TOKENS) {
    if (normalized === dangerous || normalized.includes(dangerous)) return "";
  }
  return normalized;
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
