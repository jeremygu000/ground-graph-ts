import type { DocumentParser, ParsedContent } from "../../application/ingestion/parser-port";
import type { SourceDescriptor } from "../../domain/documents/types";

export class MarkdownParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return (
      descriptor.mimeType === "text/markdown" ||
      descriptor.uri.endsWith(".md") ||
      descriptor.uri.endsWith(".markdown")
    );
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const text = content.toString("utf-8");
    const sections = this.extractSections(text, descriptor);
    const title = this.extractTitle(text);

    return {
      ...(title ? { title } : {}),
      content: text,
      metadata: {
        mimeType: descriptor.mimeType,
        uri: descriptor.uri,
        lineCount: text.split("\n").length,
      },
      sections,
    };
  }

  private extractTitle(text: string): string | undefined {
    const match = text.match(/^#\s+(.+)$/m);
    return match ? match[1] : undefined;
  }

  private extractSections(text: string, descriptor: SourceDescriptor): ParsedContent["sections"] {
    const lines = text.split("\n");
    const sections: ParsedContent["sections"] = [];
    let currentSection: ParsedContent["sections"][0] | null = null;
    let codeBlockContent: string[] = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined) {
        continue;
      }

      if (line.startsWith("```")) {
        if (!inCodeBlock) {
          if (currentSection) {
            currentSection.content += "\n" + codeBlockContent.join("\n");
            sections.push(currentSection);
          }
          inCodeBlock = true;
          codeBlockContent = [];
          currentSection = {
            type: "code",
            content: "",
            locators: [
              { type: "line", path: descriptor?.uri ?? "", startLine: i + 1, endLine: i + 1 },
            ],
          };
        } else {
          inCodeBlock = false;
          if (currentSection) {
            currentSection.content = codeBlockContent.join("\n");
            const locator = currentSection.locators[0];
            if (locator) {
              locator.endLine = i + 1;
            }
            sections.push(currentSection);
            currentSection = null;
          }
          codeBlockContent = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }
        const headingMarker = headingMatch[1];
        const headingText = headingMatch[2];
        if (!headingMarker || !headingText) {
          continue;
        }
        currentSection = {
          type: "heading",
          content: headingText,
          level: headingMarker.length,
          locators: [{ type: "heading", path: descriptor.uri, startLine: i + 1 }],
        };
      } else if (line.trim()) {
        if (!currentSection) {
          currentSection = {
            type: "paragraph",
            content: line,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1 }],
          };
        } else if (currentSection.type === "paragraph") {
          currentSection.content += "\n" + line;
          const locator = currentSection.locators[0];
          if (locator) {
            locator.endLine = i + 1;
          }
        } else {
          sections.push(currentSection);
          currentSection = {
            type: "paragraph",
            content: line,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        }
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }
}

export class PlainTextParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return (
      descriptor.mimeType?.startsWith("text/") === true ||
      descriptor.mimeType === "application/octet-stream"
    );
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const text = content.toString("utf-8");
    const lines = text.split("\n");
    const firstLine = lines[0];
    const title = firstLine ? firstLine.substring(0, 100) : "Untitled";

    return {
      title,
      content: text,
      metadata: {
        mimeType: descriptor.mimeType,
        uri: descriptor.uri,
        lineCount: lines.length,
      },
      sections: [
        {
          type: "paragraph",
          content: text,
          locators: [{ type: "line", path: descriptor.uri, startLine: 1, endLine: lines.length }],
        },
      ],
    };
  }
}

export class HtmlParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return descriptor.mimeType === "text/html";
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const html = content.toString("utf-8");
    const text = this.stripHtml(html);
    const title = this.extractTitle(html);
    const sections = this.extractSections(html);

    return {
      ...(title ? { title } : {}),
      content: text,
      metadata: {
        mimeType: descriptor.mimeType,
        uri: descriptor.uri,
      },
      sections,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private extractTitle(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = match?.[1];
    return title ? title.trim() : undefined;
  }

  private extractSections(html: string): ParsedContent["sections"] {
    const sections: ParsedContent["sections"] = [];
    const headingRegex = /<h([1-6])[^>]*>([^<]+)<\/h\1>/gi;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = headingRegex.exec(html)) !== null) {
      const levelText = match[1];
      const headingTextRaw = match[2];
      if (!levelText || !headingTextRaw) {
        continue;
      }
      const level = parseInt(levelText, 10);
      const headingText = headingTextRaw.trim();
      const startIndex = match.index;

      if (startIndex > lastIndex) {
        const paragraphContent = this.stripHtml(html.substring(lastIndex, startIndex)).trim();
        if (paragraphContent) {
          sections.push({
            type: "paragraph",
            content: paragraphContent,
            locators: [{ type: "section", path: "", startLine: 0, endLine: 0 }],
          });
        }
      }

      sections.push({
        type: "heading",
        content: headingText,
        level,
        locators: [{ type: "heading", path: "", startLine: 0 }],
      });

      lastIndex = match.index + match[0].length;
    }

    return sections;
  }
}

export class CompositeParser implements DocumentParser {
  private parsers: DocumentParser[] = [
    new MarkdownParser(),
    new HtmlParser(),
    new PlainTextParser(),
  ];

  canParse(descriptor: SourceDescriptor): boolean {
    return this.findParser(descriptor) !== undefined;
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const parser = this.findParser(descriptor);
    if (!parser) {
      throw new Error(`No parser available for ${descriptor.mimeType} (${descriptor.uri})`);
    }
    return parser.parse(content, descriptor);
  }

  addParser(parser: DocumentParser): void {
    this.parsers.unshift(parser);
  }

  private findParser(descriptor: SourceDescriptor): DocumentParser | undefined {
    return this.parsers.find((p) => p.canParse(descriptor));
  }
}
