import { describe, expect, it, vi } from "vitest";
import {
  MarkdownParser,
  PlainTextParser,
  HtmlParser,
  CompositeParser,
  PdfParser,
  DocxParser,
  EpubParser,
  CodeParser,
} from "../../../../src/infrastructure/ingestion/parsers";

vi.mock("pdf-parse", () => ({
  default: vi.fn((content: Buffer) =>
    content.toString() === "not a pdf"
      ? Promise.reject(new Error("invalid pdf"))
      : Promise.resolve({
          text: "# PDF title\nbody\n## Section\nmore",
          numpages: 2,
          info: { Title: "PDF title", Author: "Author", Subject: "Subject" },
        }),
  ),
}));
vi.mock("mammoth", () => ({
  extractText: vi.fn(({ buffer }: { buffer: Buffer }) =>
    buffer.toString() === "not a docx"
      ? Promise.reject(new Error("invalid docx"))
      : Promise.resolve({ value: "# DOCX title\nbody", messages: [{ message: "warning" }] }),
  ),
}));
vi.mock("jszip", () => ({
  default: {
    loadAsync: vi.fn((content: Buffer) =>
      content.toString() === "not an epub"
        ? Promise.reject(new Error("invalid epub"))
        : Promise.resolve({
            files: {
              "chapter.xhtml": {
                dir: false,
                async: vi
                  .fn()
                  .mockResolvedValue("<title>EPUB title</title><h1>Chapter</h1><p>Text</p>"),
              },
              "images/cover.png": { dir: false, async: vi.fn() },
            },
          }),
    ),
  },
}));

describe("MarkdownParser", () => {
  const parser = new MarkdownParser();

  describe("canParse", () => {
    it("identifies markdown by .md extension", () => {
      expect(parser.canParse({ type: "url", uri: "file.md" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "file.markdown" })).toBe(true);
    });

    it("identifies markdown by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "file.txt", mimeType: "text/markdown" })).toBe(
        true,
      );
    });

    it("rejects non-markdown", () => {
      expect(parser.canParse({ type: "url", uri: "file.txt" })).toBe(false);
      expect(parser.canParse({ type: "url", uri: "file.txt", mimeType: "text/plain" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts title from first heading", async () => {
      const result = await parser.parse(Buffer.from("# Title\n\nContent", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.title).toBe("Title");
    });

    it("extracts sections including headings and paragraphs", async () => {
      const result = await parser.parse(Buffer.from("# H1\n\nParagraph\n\n## H2\n\nMore", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections.some((s) => s.type === "heading")).toBe(true);
      expect(result.sections.some((s) => s.type === "paragraph")).toBe(true);
    });

    it("extracts code blocks", async () => {
      const result = await parser.parse(Buffer.from("Text\n\n```js\ncode\n```\n\nMore", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      const codeSection = result.sections.find((s) => s.type === "code");
      expect(codeSection).toBeDefined();
      expect(codeSection!.content).toContain("code");
    });

    it("handles code block with empty content", async () => {
      const result = await parser.parse(Buffer.from("```\n```", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections).toBeDefined();
    });

    it("handles content with only code blocks", async () => {
      const result = await parser.parse(Buffer.from("```\ncode\n```", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections.some((s) => s.type === "code")).toBe(true);
    });

    it("handles content with only paragraphs", async () => {
      const result = await parser.parse(Buffer.from("Just text\n\nMore text", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections.some((s) => s.type === "paragraph")).toBe(true);
    });

    it("closes a heading before entering a fenced code block", async () => {
      const result = await parser.parse(
        Buffer.from("# Heading\n```ts\nconst value = 1;\n```", "utf8"),
        { type: "url", uri: "test.md" },
      );
      expect(result.sections.map((section) => section.type)).toEqual(["heading", "code"]);
      expect(result.sections[1]?.content).toContain("const value = 1;");
    });

    it("handles multiple consecutive headings", async () => {
      const result = await parser.parse(Buffer.from("# H1\n## H2\n### H3", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      const headings = result.sections.filter((s) => s.type === "heading");
      expect(headings.length).toBe(3);
    });

    it("handles code block followed by heading", async () => {
      const result = await parser.parse(Buffer.from("```\ncode\n```\n\n## Heading", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections.some((s) => s.type === "heading")).toBe(true);
    });

    it("handles heading followed by code block", async () => {
      const result = await parser.parse(Buffer.from("## Heading\n\n```\ncode\n```", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.sections.some((s) => s.type === "code")).toBe(true);
    });

    it("merges consecutive paragraph lines", async () => {
      const result = await parser.parse(Buffer.from("Line 1\nLine 2\nLine 3", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      const paragraph = result.sections.find((s) => s.type === "paragraph");
      expect(paragraph).toBeDefined();
      expect(paragraph!.content).toContain("Line 1");
      expect(paragraph!.content).toContain("Line 2");
    });

    it("handles empty content", async () => {
      const result = await parser.parse(Buffer.from("", "utf8"), {
        type: "url",
        uri: "test.md",
      });
      expect(result.content).toBe("");
    });
  });
});

describe("PlainTextParser", () => {
  const parser = new PlainTextParser();

  describe("canParse", () => {
    it("identifies text by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/plain" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/html" })).toBe(true);
    });

    it("accepts application/octet-stream", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "application/octet-stream" })).toBe(
        true,
      );
    });

    it("rejects other types", () => {
      expect(parser.canParse({ type: "url", uri: "f" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("uses first line as title", async () => {
      const result = await parser.parse(Buffer.from("Title line\nRest", "utf8"), {
        type: "url",
        uri: "f.txt",
      });
      expect(result.title).toBe("Title line");
    });

    it("truncates long title to 100 chars", async () => {
      const longTitle = "a".repeat(150);
      const result = await parser.parse(Buffer.from(longTitle, "utf8"), {
        type: "url",
        uri: "f.txt",
      });
      expect(result.title!.length).toBe(100);
    });

    it("returns 'Untitled' for empty content", async () => {
      const result = await parser.parse(Buffer.from("", "utf8"), {
        type: "url",
        uri: "f.txt",
      });
      expect(result.title).toBe("Untitled");
    });

    it("counts lines in metadata", async () => {
      const result = await parser.parse(Buffer.from("a\nb\nc", "utf8"), {
        type: "url",
        uri: "f.txt",
      });
      expect(result.metadata.lineCount).toBe(3);
    });

    it("includes mime type and uri in metadata", async () => {
      const result = await parser.parse(Buffer.from("x", "utf8"), {
        type: "url",
        uri: "f.txt",
        mimeType: "text/plain",
      });
      expect(result.metadata.mimeType).toBe("text/plain");
      expect(result.metadata.uri).toBe("f.txt");
    });
  });
});

describe("HtmlParser", () => {
  const parser = new HtmlParser();

  describe("canParse", () => {
    it("identifies html by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/html" })).toBe(true);
    });

    it("rejects non-html", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/plain" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts title from <title> tag", async () => {
      const result = await parser.parse(
        Buffer.from("<html><head><title>My Title</title></head><body></body></html>", "utf8"),
        { type: "url", uri: "f.html" },
      );
      expect(result.title).toBe("My Title");
    });

    it("handles no title tag", async () => {
      const result = await parser.parse(Buffer.from("<html><body>Content</body></html>", "utf8"), {
        type: "url",
        uri: "f.html",
      });
      expect(result.title).toBeUndefined();
    });

    it("strips script tags", async () => {
      const result = await parser.parse(
        Buffer.from("<html><body>Before<script>alert('xss')</script>After</body></html>", "utf8"),
        { type: "url", uri: "f.html" },
      );
      expect(result.content).not.toContain("alert");
      expect(result.content).toContain("Before");
      expect(result.content).toContain("After");
    });

    it("strips style tags", async () => {
      const result = await parser.parse(
        Buffer.from(
          "<html><body>Content<style>body { color: red; }</style>End</body></html>",
          "utf8",
        ),
        { type: "url", uri: "f.html" },
      );
      expect(result.content).not.toContain("color");
      expect(result.content).toContain("Content");
    });

    it("strips html tags", async () => {
      const result = await parser.parse(
        Buffer.from("<html><body><h1>Hello</h1><p>World</p></body></html>", "utf8"),
        { type: "url", uri: "f.html" },
      );
      expect(result.content).toContain("Hello");
      expect(result.content).toContain("World");
    });

    it("extracts heading sections at different levels", async () => {
      const result = await parser.parse(
        Buffer.from("<html><body><h1>H1</h1><h2>H2</h2><h3>H3</h3></body></html>", "utf8"),
        { type: "url", uri: "f.html" },
      );
      expect(result.sections.some((s) => s.type === "heading" && s.level === 1)).toBe(true);
      expect(result.sections.some((s) => s.type === "heading" && s.level === 2)).toBe(true);
      expect(result.sections.some((s) => s.type === "heading" && s.level === 3)).toBe(true);
    });

    it("handles html with no headings", async () => {
      const result = await parser.parse(
        Buffer.from("<html><body>Plain text</body></html>", "utf8"),
        {
          type: "url",
          uri: "f.html",
        },
      );
      expect(result.sections).toBeDefined();
    });
  });
});

describe("archive and document parsers", () => {
  it("parses PDF metadata and markdown-like sections", async () => {
    const result = await new PdfParser().parse(Buffer.from("ignored"), {
      type: "file",
      uri: "doc.pdf",
      mimeType: "application/pdf",
    });
    expect(result.title).toBe("PDF title");
    expect(result.metadata.pageCount).toBe(2);
    expect(result.sections.map((section) => section.type)).toEqual([
      "heading",
      "paragraph",
      "heading",
      "paragraph",
    ]);
  });

  it("parses DOCX text and warnings", async () => {
    const result = await new DocxParser().parse(Buffer.from("ignored"), {
      type: "file",
      uri: "doc.docx",
    });
    expect(result.title).toBe("DOCX title");
    expect(result.metadata.warnings).toEqual(["warning"]);
  });

  it("parses EPUB chapters and ignores non-html files", async () => {
    const result = await new EpubParser().parse(Buffer.from("zip"), {
      type: "file",
      uri: "book.epub",
      mimeType: "application/epub+zip",
    });
    expect(result.title).toBe("EPUB title");
    expect(result.metadata.chapterCount).toBe(1);
    expect(result.content).toContain("Chapter");
  });

  it("dispatches custom parsers and rejects unsupported formats", async () => {
    const parser = new CompositeParser();
    const custom = {
      canParse: () => true,
      parse: vi.fn().mockResolvedValue({ content: "custom", metadata: {}, sections: [] }),
    };
    parser.addParser(custom);
    await expect(
      parser.parse(Buffer.from("x"), { type: "file", uri: "x.bin" }),
    ).resolves.toMatchObject({ content: "custom" });
    const unsupported = new CompositeParser();
    await expect(
      unsupported.parse(Buffer.from("x"), {
        type: "file",
        uri: "x.bin",
        mimeType: "application/x-unknown",
      }),
    ).rejects.toMatchObject({ reasonCode: "UNSUPPORTED_FORMAT" });
  });
});

describe("CompositeParser", () => {
  it("dispatches to first matching parser", async () => {
    const composite = new CompositeParser();
    const result = await composite.parse(Buffer.from("# Title\n\nContent", "utf8"), {
      type: "url",
      uri: "f.md",
    });
    expect(result.title).toBe("Title");
  });

  it("throws UNSUPPORTED_FORMAT when no parser matches", async () => {
    const composite = new CompositeParser();
    await expect(
      composite.parse(Buffer.from("x"), { type: "url", uri: "f.unknown" }),
    ).rejects.toMatchObject({ reasonCode: "UNSUPPORTED_FORMAT" });
  });

  it("adds custom parsers", async () => {
    const composite = new CompositeParser();
    const customParser = {
      canParse: () => true,
      parse: async () => ({ content: "custom", metadata: {}, sections: [] }),
    };
    composite.addParser(customParser);
    const result = await composite.parse(Buffer.from("x"), { type: "url", uri: "f.any" });
    expect(result.content).toBe("custom");
  });

  it("canParse returns true if any registered parser can parse", () => {
    const composite = new CompositeParser();
    composite.addParser({
      canParse: () => true,
      parse: async () => ({ content: "", metadata: {}, sections: [] }),
    });
    expect(composite.canParse({ type: "url", uri: "f" })).toBe(true);
  });
});

describe("PdfParser", () => {
  const parser = new PdfParser();

  it("handles a PDF without a text title", () => {
    const internal = parser as unknown as {
      extractTitleFromText(text: string): string | undefined;
    };
    expect(internal.extractTitleFromText("plain body")).toBeUndefined();
    expect(internal.extractTitleFromText("# Embedded title")).toBe("Embedded title");
  });

  describe("canParse", () => {
    it("identifies by .pdf extension", () => {
      expect(parser.canParse({ type: "url", uri: "f.pdf" })).toBe(true);
    });

    it("identifies by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "application/pdf" })).toBe(true);
    });

    it("rejects non-pdf", () => {
      expect(parser.canParse({ type: "url", uri: "f.txt" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("throws on invalid PDF content", async () => {
      await expect(
        parser.parse(Buffer.from("not a pdf"), { type: "url", uri: "f.pdf" }),
      ).rejects.toThrow();
    });
  });
});

describe("DocxParser", () => {
  const parser = new DocxParser();

  describe("canParse", () => {
    it("identifies by .docx extension", () => {
      expect(parser.canParse({ type: "url", uri: "f.docx" })).toBe(true);
    });

    it("identifies by mime type", () => {
      expect(
        parser.canParse({
          type: "url",
          uri: "f",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ).toBe(true);
    });

    it("rejects non-docx", () => {
      expect(parser.canParse({ type: "url", uri: "f.txt" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("throws on invalid DOCX content", async () => {
      await expect(
        parser.parse(Buffer.from("not a docx"), { type: "url", uri: "f.docx" }),
      ).rejects.toThrow();
    });
  });
});

describe("EpubParser", () => {
  const parser = new EpubParser();

  it("handles an EPUB chapter without a title", () => {
    const internal = parser as unknown as {
      extractTitleFromHtml(html: string): string | undefined;
    };
    expect(internal.extractTitleFromHtml("<h1>Chapter</h1>")).toBeUndefined();
  });

  describe("canParse", () => {
    it("identifies by .epub extension", () => {
      expect(parser.canParse({ type: "url", uri: "f.epub" })).toBe(true);
    });

    it("identifies by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "application/epub+zip" })).toBe(
        true,
      );
    });

    it("rejects non-epub", () => {
      expect(parser.canParse({ type: "url", uri: "f.txt" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("throws on invalid EPUB content", async () => {
      await expect(
        parser.parse(Buffer.from("not an epub"), { type: "url", uri: "f.epub" }),
      ).rejects.toThrow();
    });
  });
});

describe("CodeParser", () => {
  const parser = new CodeParser();

  describe("canParse", () => {
    it("identifies common code extensions", () => {
      for (const ext of [
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
      ]) {
        expect(parser.canParse({ type: "url", uri: `f${ext}` })).toBe(true);
      }
    });

    it("identifies by mime type", () => {
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/typescript" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/javascript" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/x-python" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "f", mimeType: "text/x-java" })).toBe(true);
    });

    it("rejects non-code files", () => {
      expect(parser.canParse({ type: "url", uri: "f.txt" })).toBe(false);
      expect(parser.canParse({ type: "url", uri: "f.pdf" })).toBe(false);
    });
  });

  describe("parse", () => {
    it("extracts title from filename", async () => {
      const result = await parser.parse(Buffer.from("const x = 1;", "utf8"), {
        type: "url",
        uri: "mycode.ts",
      });
      expect(result.title).toBe("mycode.ts");
    });

    it("detects TypeScript language", async () => {
      const result = await parser.parse(Buffer.from("const x = 1;", "utf8"), {
        type: "url",
        uri: "f.ts",
      });
      expect(result.metadata.language).toBe("TypeScript");
    });

    it("detects JavaScript language", async () => {
      const result = await parser.parse(Buffer.from("const x = 1;", "utf8"), {
        type: "url",
        uri: "f.js",
      });
      expect(result.metadata.language).toBe("JavaScript");
    });

    it("detects Python language", async () => {
      const result = await parser.parse(Buffer.from("def foo(): pass", "utf8"), {
        type: "url",
        uri: "f.py",
      });
      expect(result.metadata.language).toBe("Python");
    });

    it("detects Rust language", async () => {
      const result = await parser.parse(Buffer.from("fn main() {}", "utf8"), {
        type: "url",
        uri: "f.rs",
      });
      expect(result.metadata.language).toBe("Rust");
    });

    it("detects Go language", async () => {
      const result = await parser.parse(Buffer.from("package main", "utf8"), {
        type: "url",
        uri: "f.go",
      });
      expect(result.metadata.language).toBe("Go");
    });

    it("returns Unknown for unknown extensions", async () => {
      const result = await parser.parse(Buffer.from("x", "utf8"), {
        type: "url",
        uri: "f.unknown",
        mimeType: "text/plain",
      });
      expect(result.metadata.language).toBe("Unknown");
    });

    it("extracts code sections from function declarations", async () => {
      const result = await parser.parse(
        Buffer.from("function foo() {\n  return 1;\n}\n\nfunction bar() {}", "utf8"),
        { type: "url", uri: "f.js" },
      );
      expect(result.sections.length).toBeGreaterThan(0);
      expect(result.sections.every((s) => s.type === "code")).toBe(true);
    });

    it("extracts code sections from Python def", async () => {
      const result = await parser.parse(
        Buffer.from("def foo():\n    return 1\n\ndef bar():\n    return 2", "utf8"),
        { type: "url", uri: "f.py" },
      );
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("extracts import statements as code sections", async () => {
      const result = await parser.parse(
        Buffer.from("import { foo } from './foo';\n\nconst x = 1;", "utf8"),
        { type: "url", uri: "f.ts" },
      );
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("extracts Python imports", async () => {
      const result = await parser.parse(
        Buffer.from("from os import path\n\ndef main(): pass", "utf8"),
        { type: "url", uri: "f.py" },
      );
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("merges consecutive code lines", async () => {
      const result = await parser.parse(Buffer.from("x = 1;\ny = 2;\nz = 3;", "utf8"), {
        type: "url",
        uri: "f.py",
      });
      expect(result.sections.length).toBe(1);
      expect(result.sections[0]!.content).toContain("x = 1");
      expect(result.sections[0]!.content).toContain("y = 2");
    });

    it("includes comments in code sections", async () => {
      const result = await parser.parse(
        Buffer.from("const x = 1;\n// comment\nconst y = 2;", "utf8"),
        { type: "url", uri: "f.ts" },
      );
      const content = result.sections.map((s) => s.content).join("\n");
      expect(content).toContain("comment");
    });

    it("handles empty content", async () => {
      const result = await parser.parse(Buffer.from("", "utf8"), {
        type: "url",
        uri: "f.ts",
      });
      expect(result.content).toBe("");
    });

    it("handles content with only comments", async () => {
      const result = await parser.parse(Buffer.from("// just a comment", "utf8"), {
        type: "url",
        uri: "f.ts",
      });
      expect(result).toBeDefined();
    });
  });
});
