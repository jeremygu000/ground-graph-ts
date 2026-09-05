import type {
  CitationBuilderPort,
  CitationOutput,
  VectorSearchResultRow,
  FullTextSearchResultRow,
} from "../../application/models/ports";
import type { RetrievalResult } from "../../domain/retrieval/types";
import type { EvidenceReference } from "../../domain/documents/types";
import { success, failure, type Result } from "../../domain/result";
import { InternalError } from "../../domain/errors";

export class CitationBuilder implements CitationBuilderPort {
  async buildFromRetrieval(
    results: RetrievalResult[],
    _tenantId: string,
  ): Promise<Result<CitationOutput[]>> {
    const citations: CitationOutput[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (!r) continue;
      const chunkId = r.chunkId;
      if (!chunkId) continue;
      const evidenceId = deriveEvidenceId(chunkId, i);
      const documentVersionId = r.metadata?.["documentVersionId"];
      const documentVersionIdStr = typeof documentVersionId === "string" ? documentVersionId : "";
      if (!documentVersionIdStr) {
        return failure(
          new InternalError("Retrieval result missing documentVersionId metadata", {
            chunkId,
          }),
        );
      }
      const locator = r.metadata?.["locator"] as
        | { path?: string; startLine?: number; endLine?: number }
        | undefined;
      const locatorPath = locator?.path ?? "";
      const startChar = r.content.length > 0 ? 0 : 0;
      const endChar = r.content.length;
      const citationId = `CIT-${i + 1}-${chunkId.slice(0, 8)}`;
      citations.push({
        citationId,
        evidenceId,
        chunkId,
        documentVersionId: documentVersionIdStr,
        locatorPath,
        snippet: r.content,
        startChar,
        endChar,
        score: r.score,
      });
    }
    return success(citations);
  }

  buildEvidenceReferences(citations: CitationOutput[]): EvidenceReference[] {
    return citations.map((c) => ({
      evidenceId: c.evidenceId,
      chunkId: c.chunkId,
      position: {
        startChar: c.startChar,
        endChar: c.endChar,
      },
      snippet: c.snippet,
    }));
  }
}

export function buildCitationId(chunkId: string, index: number): string {
  return `CIT-${index + 1}-${chunkId.slice(0, 8)}`;
}

export function deriveEvidenceId(chunkId: string, index: number): string {
  return `EV-${chunkId.slice(0, 8)}-${index}`;
}

export function retrievalToCitation(
  row: VectorSearchResultRow | FullTextSearchResultRow,
  index: number,
): CitationOutput {
  return {
    citationId: buildCitationId(row.chunkId, index),
    evidenceId: deriveEvidenceId(row.chunkId, index),
    chunkId: row.chunkId,
    documentVersionId: row.documentVersionId,
    locatorPath: (row.locator as { path?: string })?.path ?? "",
    snippet: row.content,
    startChar: 0,
    endChar: row.content.length,
    score: row.score,
  };
}
