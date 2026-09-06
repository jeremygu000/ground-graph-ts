import type { Chunk } from "../../domain/documents/documents.schema";

export type ChunkFragment = Omit<Chunk, "id" | "documentVersionId" | "principalId">;

export interface Chunker {
  chunk(content: ChunkableContent, options: ChunkingOptions): Promise<ChunkFragment[]>;
}

export interface ChunkableContent {
  content: string;
  title?: string;
  sections: ContentSection[];
}

export interface ContentSection {
  type: "heading" | "paragraph" | "code" | "table" | "list" | "other";
  content: string;
  level?: number;
  locators: ContentLocator[];
}

export interface ContentLocator {
  type: "line" | "heading" | "page" | "section";
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface ChunkingOptions {
  maxChunkSize: number;
  overlapSize: number;
  strategy: "heading" | "recursive" | "page" | "semantic";
}
