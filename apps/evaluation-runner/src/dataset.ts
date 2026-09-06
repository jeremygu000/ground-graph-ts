import { readFileSync } from "fs";
import { join } from "path";
import type { BaselineCase, CorpusChunk, DatasetMetadata } from "./evaluation.types";

export function loadDataset(datasetPath: string): {
  cases: BaselineCase[];
  metadata: DatasetMetadata;
} {
  const data = JSON.parse(readFileSync(datasetPath, "utf-8")) as DatasetMetadata;
  return { cases: data.cases, metadata: data };
}

export function loadCorpus(projectRoot: string): CorpusChunk[] {
  const raw = readFileSync(join(projectRoot, "evals", "retrieval", "corpus.json"), "utf8");
  const data = JSON.parse(raw) as {
    chunks: Array<{
      chunkId: string;
      documentVersionId: string;
      documentId?: string;
      content: string;
      locator: Record<string, unknown>;
    }>;
  };
  return data.chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentVersionId: chunk.documentVersionId,
    documentId: chunk.documentId ?? chunk.documentVersionId,
    content: chunk.content,
    locator: chunk.locator,
  }));
}
