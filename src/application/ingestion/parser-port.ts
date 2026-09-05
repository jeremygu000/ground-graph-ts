import type { SourceDescriptor } from "../../domain/documents/types";

export interface DocumentParser {
  parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent>;
  canParse(descriptor: SourceDescriptor): boolean;
}

export interface ParsedContent {
  title?: string;
  content: string;
  metadata: Record<string, unknown>;
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
