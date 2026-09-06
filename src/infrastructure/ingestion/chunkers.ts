import { createHash } from "node:crypto";
import type {
  Chunker,
  ChunkableContent,
  ChunkingOptions,
  ChunkFragment,
  ContentSection,
} from "../../application/ingestion/chunker-port.types";

export class HeadingChunker implements Chunker {
  async chunk(content: ChunkableContent, options: ChunkingOptions): Promise<ChunkFragment[]> {
    const chunks: ChunkFragment[] = [];
    let sequenceNumber = 0;
    let currentContent = "";
    let currentLocators: ContentSection["locators"] = [];
    const headingLevel = options.maxChunkSize > 1000 ? 2 : 1;

    for (const section of content.sections) {
      if (section.type === "heading" && (section.level ?? 1) <= headingLevel) {
        if (currentContent && this.shouldCreateChunk(currentContent, options)) {
          chunks.push(
            this.createChunk(content.title, currentContent, sequenceNumber++, currentLocators),
          );
          currentContent = "";
          currentLocators = [];
        }
        currentContent += (currentContent ? "\n\n" : "") + `# ${section.content}`;
        currentLocators = section.locators;
      } else {
        const newContent = currentContent
          ? currentContent + "\n\n" + section.content
          : section.content;
        if (this.shouldCreateChunk(newContent, options)) {
          currentContent = newContent;
          currentLocators = currentLocators.length ? currentLocators : section.locators;
        } else {
          if (currentContent) {
            chunks.push(
              this.createChunk(content.title, currentContent, sequenceNumber++, currentLocators),
            );
          }
          currentContent = section.content;
          currentLocators = section.locators;
        }
      }
    }

    if (currentContent) {
      chunks.push(this.createChunk(content.title, currentContent, sequenceNumber, currentLocators));
    }

    return chunks;
  }

  private shouldCreateChunk(content: string, options: ChunkingOptions): boolean {
    return content.length >= options.maxChunkSize;
  }

  private createChunk(
    title: string | undefined,
    content: string,
    sequenceNumber: number,
    locators: ContentSection["locators"],
  ): ChunkFragment {
    return {
      sequenceNumber,
      content,
      contentHash: this.hashContent(content),
      locator: locators[0] ?? { type: "line", path: title ?? "", startLine: 1 },
      createdAt: new Date().toISOString(),
    };
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }
}

export class RecursiveChunker implements Chunker {
  async chunk(content: ChunkableContent, options: ChunkingOptions): Promise<ChunkFragment[]> {
    const chunks: ChunkFragment[] = [];
    const text = content.content;
    let start = 0;
    let sequenceNumber = 0;

    while (start < text.length) {
      let end = Math.min(start + options.maxChunkSize, text.length);

      if (end < text.length) {
        const separator = this.findSeparator(text, start, end, options);
        if (separator) {
          end = separator;
        } else {
          const lastSpace = text.lastIndexOf(" ", end);
          if (lastSpace > start + options.maxChunkSize * 0.5) {
            end = lastSpace;
          }
        }
      }

      const chunkContent = text.substring(start, end).trim();
      if (chunkContent) {
        chunks.push({
          sequenceNumber: sequenceNumber++,
          content: chunkContent,
          contentHash: this.hashContent(chunkContent),
          locator: {
            type: "line",
            path: content.title ?? "",
            startLine: this.countLines(text, start),
            endLine: this.countLines(text, end),
          },
          createdAt: new Date().toISOString(),
        });
      }

      start = end;
      if (options.overlapSize > 0 && start < text.length) {
        const overlapStart = Math.max(0, start - options.overlapSize);
        const overlapText = text.substring(overlapStart, start);
        const lastSpace = overlapText.lastIndexOf(" ");
        if (lastSpace > 0) {
          start = overlapStart + lastSpace;
        }
      }
    }

    return chunks;
  }

  private findSeparator(
    text: string,
    start: number,
    end: number,
    options: ChunkingOptions,
  ): number | null {
    const separators = ["\n\n", "\n", ". ", " "];
    for (const sep of separators) {
      const idx = text.lastIndexOf(sep, end);
      if (idx > start + options.maxChunkSize * 0.5) {
        return idx + sep.length;
      }
    }
    return null;
  }

  private countLines(text: string, position: number): number {
    return text.substring(0, position).split("\n").length;
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }
}

export class CompositeChunker implements Chunker {
  constructor(private chunkers: Chunker[]) {}

  async chunk(content: ChunkableContent, options: ChunkingOptions): Promise<ChunkFragment[]> {
    for (const chunker of this.chunkers) {
      if (chunker instanceof HeadingChunker && options.strategy === "heading") {
        return chunker.chunk(content, options);
      }
      if (chunker instanceof RecursiveChunker && options.strategy === "recursive") {
        return chunker.chunk(content, options);
      }
    }
    if (options.strategy === "page" || options.strategy === "semantic") {
      throw new Error(`Chunking strategy '${options.strategy}' is not yet implemented`);
    }
    return new RecursiveChunker().chunk(content, options);
  }
}
