import { randomUUID } from "node:crypto";
import type { CitationBuilderPort, CitationOutput } from "../../application/models/ports";
import type { RetrievalResult } from "../../domain/retrieval/retrieval.schema";
import type { EvidenceReference } from "../../domain/documents/documents.schema";
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
      const citationId = randomUUID();
      const evidenceId = randomUUID();
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
