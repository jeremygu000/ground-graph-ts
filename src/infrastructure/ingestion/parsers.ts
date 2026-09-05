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
    new CodeParser(),
    new PdfParser(),
    new DocxParser(),
    new EpubParser(),
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

export class PdfParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return descriptor.mimeType === "application/pdf" || descriptor.uri.endsWith(".pdf");
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const pdfParse = await import("pdf-parse");
    const data = await pdfParse.default(content);
    const text = data.text ?? "";
    const title = data.info?.Title || this.extractTitleFromText(text);
    const sections = this.extractSections(text, descriptor);

    return {
      ...(title ? { title } : {}),
      content: text,
      metadata: {
        mimeType: "application/pdf",
        uri: descriptor.uri,
        pageCount: data.numpages,
        author: data.info?.Author,
        subject: data.info?.Subject,
      },
      sections,
    };
  }

  private extractTitleFromText(text: string): string | undefined {
    const match = text.match(/^#\s+(.+)$/m);
    return match ? match[1] : undefined;
  }

  private extractSections(text: string, descriptor: SourceDescriptor): ParsedContent["sections"] {
    const lines = text.split("\n");
    const sections: ParsedContent["sections"] = [];
    let currentSection: ParsedContent["sections"][0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();
      if (!trimmed) continue;

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          type: "heading",
          content: headingMatch[2],
          level: headingMatch[1].length,
          locators: [{ type: "heading", path: descriptor.uri, startLine: i + 1 }],
        };
      } else {
        if (!currentSection) {
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        } else if (currentSection.type === "paragraph") {
          currentSection.content += "\n" + trimmed;
          const loc = currentSection.locators[currentSection.locators.length - 1];
          if (loc) loc.endLine = i + 1;
        } else {
          sections.push(currentSection);
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        }
      }
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }
}

export class DocxParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return (
      descriptor.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      descriptor.uri.endsWith(".docx")
    );
  }

  async parse(buffer: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractText({ buffer });

    const text = result.value;
    const title = this.extractTitleFromText(text);
    const sections = this.extractSections(text, descriptor);

    return {
      ...(title ? { title } : {}),
      content: text,
      metadata: {
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        uri: descriptor.uri,
        warnings: result.messages.map((m) => m.message),
      },
      sections,
    };
  }

  private extractTitleFromText(text: string): string | undefined {
    const match = text.match(/^#\s+(.+)$/m);
    return match ? match[1] : undefined;
  }

  private extractSections(text: string, descriptor: SourceDescriptor): ParsedContent["sections"] {
    const lines = text.split("\n");
    const sections: ParsedContent["sections"] = [];
    let currentSection: ParsedContent["sections"][0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();
      if (!trimmed) continue;

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          type: "heading",
          content: headingMatch[2],
          level: headingMatch[1].length,
          locators: [{ type: "heading", path: descriptor.uri, startLine: i + 1 }],
        };
      } else {
        if (!currentSection) {
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        } else if (currentSection.type === "paragraph") {
          currentSection.content += "\n" + trimmed;
          const loc = currentSection.locators[currentSection.locators.length - 1];
          if (loc) loc.endLine = i + 1;
        } else {
          sections.push(currentSection);
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        }
      }
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }
}

export class EpubParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    return descriptor.mimeType === "application/epub+zip" || descriptor.uri.endsWith(".epub");
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(content);

    const htmlFiles: Array<{ name: string; content: string }> = [];

    for (const [name, file] of Object.entries(zip.files)) {
      if (
        !file.dir &&
        (name.endsWith(".xhtml") || name.endsWith(".html") || name.endsWith(".htm"))
      ) {
        const text = await file.async("string");
        htmlFiles.push({ name, content: text });
      }
    }

    htmlFiles.sort((a, b) => a.name.localeCompare(b.name));

    const textParts: string[] = [];
    let title: string | undefined;

    for (const { content } of htmlFiles) {
      const stripped = this.stripHtml(content);
      const extracted = this.extractTitleFromHtml(content);
      if (!title && extracted) title = extracted;
      textParts.push(stripped);
    }

    const combinedText = textParts.join("\n\n");
    const sections = this.extractSections(combinedText, descriptor);

    return {
      ...(title ? { title } : {}),
      content: combinedText,
      metadata: {
        mimeType: "application/epub+zip",
        uri: descriptor.uri,
        chapterCount: htmlFiles.length,
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

  private extractTitleFromHtml(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const titleText = match?.[1];
    return titleText ? titleText.trim() : undefined;
  }

  private extractSections(text: string, descriptor: SourceDescriptor): ParsedContent["sections"] {
    const lines = text.split("\n");
    const sections: ParsedContent["sections"] = [];
    let currentSection: ParsedContent["sections"][0] | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();
      if (!trimmed) continue;

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch && headingMatch[1] && headingMatch[2]) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          type: "heading",
          content: headingMatch[2],
          level: headingMatch[1].length,
          locators: [{ type: "heading", path: descriptor.uri, startLine: i + 1 }],
        };
      } else {
        if (!currentSection) {
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        } else if (currentSection.type === "paragraph") {
          currentSection.content += "\n" + trimmed;
          const loc = currentSection.locators[currentSection.locators.length - 1];
          if (loc) loc.endLine = i + 1;
        } else {
          sections.push(currentSection);
          currentSection = {
            type: "paragraph",
            content: trimmed,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        }
      }
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }
}

export class CodeParser implements DocumentParser {
  canParse(descriptor: SourceDescriptor): boolean {
    const codeExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".java",
      ".kt",
      ".cs",
      ".cpp",
      ".c",
      ".h",
      ".hpp",
      ".swift",
      ".php",
    ];
    return (
      codeExtensions.some((ext) => descriptor.uri.endsWith(ext)) ||
      (descriptor.mimeType !== undefined &&
        (descriptor.mimeType === "text/typescript" ||
          descriptor.mimeType === "text/javascript" ||
          descriptor.mimeType === "text/x-python" ||
          descriptor.mimeType === "text/x-java"))
    );
  }

  async parse(content: Buffer, descriptor: SourceDescriptor): Promise<ParsedContent> {
    const text = content.toString("utf-8");
    const lines = text.split("\n");
    const language = this.detectLanguage(descriptor.uri);
    const sections = this.extractSections(text, lines, language, descriptor);

    return {
      title: this.extractTitleFromFilename(descriptor.uri),
      content: text,
      metadata: {
        mimeType: descriptor.mimeType ?? "text/plain",
        uri: descriptor.uri,
        language,
        lineCount: lines.length,
      },
      sections,
    };
  }

  private detectLanguage(uri: string): string {
    const ext = uri.split(".").pop()?.toLowerCase();
    const langs: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      mjs: "JavaScript",
      cjs: "JavaScript",
      py: "Python",
      rb: "Ruby",
      go: "Go",
      rs: "Rust",
      java: "Java",
      kt: "Kotlin",
      cs: "C#",
      cpp: "C++",
      c: "C",
      h: "C",
      hpp: "C++",
      swift: "Swift",
      php: "PHP",
    };
    return langs[ext ?? ""] ?? "Unknown";
  }

  private extractTitleFromFilename(uri: string): string {
    const parts = uri.split("/");
    const filename = parts[parts.length - 1] ?? uri;
    return filename;
  }

  private extractSections(
    _text: string,
    lines: string[],
    language: string,
    descriptor: SourceDescriptor,
  ): ParsedContent["sections"] {
    const sections: ParsedContent["sections"] = [];
    let currentSection: ParsedContent["sections"][0] | null = null;

    const blockKeywords =
      language === "Python"
        ? ["def ", "class ", "async def ", "async class "]
        : ["function ", "const ", "let ", "var ", "class ", "interface ", "type ", "enum "];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) {
        if (currentSection) {
          if (
            (currentSection.type === "code" && trimmed.startsWith("//")) ||
            trimmed.startsWith("#")
          ) {
            currentSection.content += "\n" + line;
            const loc = currentSection.locators[0];
            if (loc) loc.endLine = i + 1;
          }
        }
        continue;
      }

      const isBlockDef = blockKeywords.some((kw) => trimmed.startsWith(kw));
      const isImport = /^import\s/.test(trimmed) || /^from\s+\w+\s+import\s/.test(trimmed);

      if (isBlockDef || isImport) {
        if (currentSection) sections.push(currentSection);
        currentSection = {
          type: "code",
          content: line,
          locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
        };
      } else {
        if (!currentSection) {
          currentSection = {
            type: "code",
            content: line,
            locators: [{ type: "line", path: descriptor.uri, startLine: i + 1, endLine: i + 1 }],
          };
        } else {
          currentSection.content += "\n" + line;
          const loc = currentSection.locators[0];
          if (loc) loc.endLine = i + 1;
        }
      }
    }

    if (currentSection) sections.push(currentSection);
    return sections;
  }
}
