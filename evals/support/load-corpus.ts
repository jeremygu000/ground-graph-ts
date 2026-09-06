import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface CorpusChunk {
  chunkId: string;
  documentVersionId: string;
  documentId: string;
  content: string;
  locator: Record<string, unknown>;
}

export interface CorpusData {
  version: string;
  tenantId: string;
  chunks: Array<{
    chunkId: string;
    documentVersionId: string;
    documentId?: string;
    content: string;
    locator: Record<string, unknown>;
  }>;
}

export function loadCorpus(corpusPath?: string): CorpusChunk[] {
  const base = corpusPath ?? getRootDir();
  const corpusFile = join(base, "evals", "retrieval", "corpus.json");
  const raw = readFileSync(corpusFile, "utf8");
  const data = JSON.parse(raw) as CorpusData;

  return data.chunks.map((c) => ({
    chunkId: c.chunkId,
    documentVersionId: c.documentVersionId,
    documentId: c.documentId ?? c.documentVersionId,
    content: c.content,
    locator: c.locator,
  }));
}

function getRootDir(): string {
  if (process.cwd().includes("apps/evaluation-runner")) {
    return join(process.cwd(), "..", "..");
  }
  return process.cwd();
}
