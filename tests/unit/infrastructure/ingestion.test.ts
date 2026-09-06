import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompositeChunker,
  HeadingChunker,
  RecursiveChunker,
} from "../../../src/infrastructure/ingestion/chunkers";
import {
  CodeParser,
  CompositeParser,
  DocxParser,
  EpubParser,
  HtmlParser,
  MarkdownParser,
  PdfParser,
  PlainTextParser,
} from "../../../src/infrastructure/ingestion/parsers";
import {
  CompositeContentFetcher,
  DefaultContentFetcherFactory,
  FileContentFetcher,
  S3ContentFetcher,
  UrlContentFetcher,
} from "../../../src/infrastructure/ingestion/content-fetcher";
import { setGlobalObjectStorageClient } from "../../../src/infrastructure/object-storage/client";

describe("ingestion infrastructure", () => {
  afterEach(() => {
    setGlobalObjectStorageClient(undefined as never);
    vi.restoreAllMocks();
  });

  describe("chunkers", () => {
    it("chunks by heading and fallback recursion", async () => {
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
        "00000000-0000-4000-8000-000000000001",
      );

      const headingChunker = new HeadingChunker();
      const chunks = await headingChunker.chunk(
        {
          title: "Doc",
          content: "ignored",
          sections: [
            {
              type: "heading",
              content: "Intro",
              level: 1,
              locators: [{ type: "heading", path: "doc.md", startLine: 1 }],
            },
            {
              type: "paragraph",
              content: "Paragraph body",
              locators: [{ type: "line", path: "doc.md", startLine: 2, endLine: 2 }],
            },
          ],
        },
        { maxChunkSize: 8, overlapSize: 0, strategy: "heading" },
      );

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.content).toContain("# Intro");

      const recursiveChunker = new RecursiveChunker();
      const recursiveChunks = await recursiveChunker.chunk(
        {
          title: "Doc",
          content: "alpha beta gamma delta",
          sections: [],
        },
        { maxChunkSize: 10, overlapSize: 2, strategy: "recursive" },
      );

      expect(recursiveChunks.length).toBeGreaterThan(1);
      expect(recursiveChunks[0]?.locator.path).toBe("Doc");

      const composite = new CompositeChunker([headingChunker, recursiveChunker]);
      await expect(
        composite.chunk(
          {
            title: "Doc",
            content: "ignored",
            sections: [
              {
                type: "heading",
                content: "Intro",
                level: 1,
                locators: [{ type: "heading", path: "doc.md", startLine: 1 }],
              },
            ],
          },
          { maxChunkSize: 8, overlapSize: 0, strategy: "heading" },
        ),
      ).resolves.toHaveLength(1);
    });

    it("uses wider heading levels and recursive separator fallbacks", async () => {
      vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
        "00000000-0000-4000-8000-000000000002",
      );

      const headingChunker = new HeadingChunker();
      await expect(
        headingChunker.chunk(
          {
            title: "Doc",
            content: "ignored",
            sections: [
              {
                type: "heading",
                content: "Top",
                level: 2,
                locators: [{ type: "heading", path: "doc.md", startLine: 1 }],
              },
              {
                type: "paragraph",
                content: "tail",
                locators: [{ type: "line", path: "doc.md", startLine: 2, endLine: 2 }],
              },
            ],
          },
          { maxChunkSize: 2001, overlapSize: 0, strategy: "heading" },
        ),
      ).resolves.toHaveLength(2);

      const recursiveChunker = new RecursiveChunker();
      const recursiveChunks = await recursiveChunker.chunk(
        {
          title: "Doc",
          content: "abcdefghij klmnopqrst uvwxyz",
          sections: [],
        },
        { maxChunkSize: 8, overlapSize: 3, strategy: "recursive" },
      );

      expect(recursiveChunks.length).toBeGreaterThan(1);
      expect(recursiveChunks[0]?.content.length).toBeGreaterThan(0);

      const composite = new CompositeChunker([headingChunker, recursiveChunker]);
      await expect(
        composite.chunk(
          {
            title: "Doc",
            content: "abcdef",
            sections: [],
          },
          { maxChunkSize: 8, overlapSize: 0, strategy: "semantic" },
        ),
      ).rejects.toThrow("Chunking strategy 'semantic' is not yet implemented");
    });
  });

  describe("parsers", () => {
    it("parses markdown, html, and plain text content", async () => {
      const markdown = new MarkdownParser();
      expect(markdown.canParse({ type: "url", uri: "https://example.com/file.md" })).toBe(true);
      const markdownParsed = await markdown.parse(
        Buffer.from("# Title\n\nParagraph\n\n```ts\nconst x = 1;\n```", "utf8"),
        { type: "url", uri: "https://example.com/file.md" },
      );
      expect(markdownParsed.title).toBe("Title");
      expect(markdownParsed.sections.some((section) => section.type === "code")).toBe(true);

      const html = new HtmlParser();
      expect(
        html.canParse({ type: "url", uri: "https://example.com", mimeType: "text/html" }),
      ).toBe(true);
      const htmlParsed = await html.parse(
        Buffer.from(
          "<html><head><title>Doc</title></head><body><h1>Hello</h1><p>World</p></body></html>",
          "utf8",
        ),
        { type: "url", uri: "https://example.com", mimeType: "text/html" },
      );
      expect(htmlParsed.title).toBe("Doc");
      expect(htmlParsed.content).toContain("Hello World");

      const text = new PlainTextParser();
      expect(
        text.canParse({ type: "url", uri: "https://example.com", mimeType: "text/plain" }),
      ).toBe(true);
      const textParsed = await text.parse(Buffer.from("First line\nSecond line", "utf8"), {
        type: "url",
        uri: "https://example.com",
        mimeType: "text/plain",
      });
      expect(textParsed.title).toBe("First line");
      expect(textParsed.metadata.lineCount).toBe(2);

      const composite = new CompositeParser();
      expect(composite.canParse({ type: "url", uri: "https://example.com/readme.md" })).toBe(true);
      const compositeParsed = await composite.parse(Buffer.from("# Composite\n\nBody", "utf8"), {
        type: "url",
        uri: "https://example.com/readme.md",
      });
      expect(compositeParsed.title).toBe("Composite");
    });

    it("covers parser fallbacks and error paths", async () => {
      const markdown = new MarkdownParser();
      const parsedWithoutTitle = await markdown.parse(Buffer.from("Paragraph only", "utf8"), {
        type: "url",
        uri: "https://example.com/file.md",
      });
      expect(parsedWithoutTitle.title).toBeUndefined();

      const html = new HtmlParser();
      const parsedHtml = await html.parse(
        Buffer.from("<html><body><p>Body</p></body></html>", "utf8"),
        { type: "url", uri: "https://example.com" },
      );
      expect(parsedHtml.title).toBeUndefined();
      expect(parsedHtml.sections.length).toBe(0);

      const plain = new PlainTextParser();
      const emptyParsed = await plain.parse(Buffer.from("", "utf8"), {
        type: "url",
        uri: "https://example.com/empty.txt",
      });
      expect(emptyParsed.title).toBe("Untitled");

      const composite = new CompositeParser();
      composite.addParser({
        canParse: () => true,
        parse: vi.fn().mockResolvedValue({
          content: "custom",
          metadata: {},
          sections: [],
        }),
      });
      await expect(
        composite.parse(Buffer.from("x", "utf8"), {
          type: "url",
          uri: "https://example.com/custom.bin",
        }),
      ).resolves.toMatchObject({ content: "custom" });

      await expect(
        new CompositeParser().parse(Buffer.from("x", "utf8"), {
          type: "url",
          uri: "https://example.com/custom.bin",
          mimeType: "application/x-custom",
        }),
      ).rejects.toThrow("No parser available");
    });

    it("covers parser canParse false branches", () => {
      const markdown = new MarkdownParser();
      expect(markdown.canParse({ type: "url", uri: "https://example.com/file.txt" })).toBe(false);

      const html = new HtmlParser();
      expect(
        html.canParse({ type: "url", uri: "https://example.com", mimeType: "application/json" }),
      ).toBe(false);

      const plain = new PlainTextParser();
      expect(
        plain.canParse({ type: "url", uri: "https://example.com", mimeType: "application/json" }),
      ).toBe(false);

      const composite = new CompositeParser();
      expect(
        composite.canParse({
          type: "url",
          uri: "https://example.com/file.bin",
          mimeType: "application/x-custom",
        }),
      ).toBe(false);
    });
  });

  describe("content fetchers", () => {
    it("fetches file and s3 content through the composite dispatcher", async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "ground-graph-fetch-"));
      const filePath = join(tempDir, "sample.txt");
      await writeFile(filePath, "hello file", "utf8");

      const fileFetcher = new FileContentFetcher();
      await expect(fileFetcher.fetch(`file://${filePath}`)).resolves.toEqual(
        Buffer.from("hello file"),
      );
      await expect(fileFetcher.fetch("https://example.com")).rejects.toThrow("file://");

      const composite = new CompositeContentFetcher();
      composite.register("file", fileFetcher);
      await expect(composite.fetch(`file://${filePath}`)).resolves.toEqual(
        Buffer.from("hello file"),
      );
      await expect(composite.fetch("s3://bucket/key")).rejects.toThrow("No ContentFetcher");

      const factory = new DefaultContentFetcherFactory();
      expect(factory.create()).toBeInstanceOf(CompositeContentFetcher);

      const download = vi.fn().mockResolvedValue(Buffer.from("hello s3"));
      setGlobalObjectStorageClient({ download } as never);
      const s3Fetcher = new S3ContentFetcher("raw");
      await expect(s3Fetcher.fetch("s3://bucket/key")).resolves.toEqual(Buffer.from("hello s3"));
      expect(download).toHaveBeenCalledWith("bucket/key", "raw");
      await expect(s3Fetcher.fetch("file://bucket/key")).rejects.toThrow("s3://");

      await expect(readFile(filePath)).resolves.toEqual(Buffer.from("hello file"));
    });
  });

  describe("URL content fetcher SSRF protection", () => {
    it("rejects non-http/https URIs", async () => {
      const fetcher = new UrlContentFetcher();
      await expect(fetcher.fetch("file:///etc/passwd")).rejects.toThrow("http/https");
      await expect(fetcher.fetch("ftp://example.com")).rejects.toThrow("http/https");
    });

    it("rejects URLs with credentials", async () => {
      const fetcher = new UrlContentFetcher();
      await expect(fetcher.fetch("https://user:pass@example.com/")).rejects.toThrow(
        "credentials are not allowed",
      );
    });

    it("rejects blocked hostnames", async () => {
      const fetcher = new UrlContentFetcher();
      for (const host of [
        "localhost",
        "metadata.google.internal",
        "metadata.aws",
        "169.254.169.254",
        "metadata.azure.com",
      ]) {
        await expect(fetcher.fetch(`https://${host}/`)).rejects.toThrow("blocked hostname");
      }
    });

    it("rejects private IPv4 addresses", async () => {
      const fetcher = new UrlContentFetcher();
      for (const ip of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.0.1"]) {
        await expect(fetcher.fetch(`https://${ip}/`)).rejects.toThrow(
          "private IP addresses are not allowed",
        );
      }
    });

    it("rejects loopback IPv6 addresses", async () => {
      const fetcher = new UrlContentFetcher();
      await expect(fetcher.fetch("https://[::1]/")).rejects.toThrow();
    });

    it("rejects private IPv6 addresses via DNS resolution", async () => {
      const fetcher = new UrlContentFetcher();
      await expect(fetcher.fetch("https://[fe80::1]/")).rejects.toThrow();
    });
  });

  describe("code parser", () => {
    it("parses code files and detects language", () => {
      const parser = new CodeParser();

      expect(parser.canParse({ type: "url", uri: "test.ts" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.py" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.rb" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.go" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.rs" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.java" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.swift" })).toBe(true);
      expect(parser.canParse({ type: "url", uri: "test.php" })).toBe(true);

      expect(parser.canParse({ type: "url", uri: "test.txt" })).toBe(false);
    });

    it("extracts code sections from TypeScript", async () => {
      const parser = new CodeParser();
      const content = Buffer.from(`import { foo } from "./foo";

function bar() {
  return 42;
}

export { bar };`);

      const result = await parser.parse(content, { type: "url", uri: "test.ts" });
      expect(result.content).toContain("import { foo }");
      expect(result.metadata.language).toBe("TypeScript");
      expect(result.sections.length).toBeGreaterThan(0);
    });

    it("extracts code sections from Python", async () => {
      const parser = new CodeParser();
      const content = Buffer.from(`def main():
    print("hello")

class Foo:
    pass`);

      const result = await parser.parse(content, { type: "url", uri: "test.py" });
      expect(result.metadata.language).toBe("Python");
      expect(result.sections.length).toBeGreaterThan(0);
    });
  });

  describe("PDF parser", () => {
    it("canParse identifies PDF files by extension and mime type", () => {
      const parser = new PdfParser();
      expect(parser.canParse({ type: "url", uri: "doc.pdf" })).toBe(true);
      expect(parser.canParse({ type: "url", mimeType: "application/pdf", uri: "doc.bin" })).toBe(
        true,
      );
      expect(parser.canParse({ type: "url", uri: "doc.txt" })).toBe(false);
    });
  });

  describe("DOCX parser", () => {
    it("canParse identifies DOCX files", () => {
      const parser = new DocxParser();
      expect(parser.canParse({ type: "url", uri: "doc.docx" })).toBe(true);
      expect(
        parser.canParse({
          type: "url",
          uri: "doc.bin",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ).toBe(true);
      expect(parser.canParse({ type: "url", uri: "doc.txt" })).toBe(false);
    });
  });

  describe("EPUB parser", () => {
    it("canParse identifies EPUB files", () => {
      const parser = new EpubParser();
      expect(parser.canParse({ type: "url", uri: "book.epub" })).toBe(true);
      expect(
        parser.canParse({ type: "url", mimeType: "application/epub+zip", uri: "book.bin" }),
      ).toBe(true);
      expect(parser.canParse({ type: "url", uri: "book.txt" })).toBe(false);
    });
  });

  describe("composite parser", () => {
    it("rejects unsupported format with UNSUPPORTED_FORMAT reason code", async () => {
      const composite = new CompositeParser();
      try {
        await composite.parse(Buffer.from("x"), {
          type: "url",
          uri: "https://example.com/file.bin",
          mimeType: "application/x-unsupported",
        });
        expect.fail("should have thrown");
      } catch (err: any) {
        expect(err.reasonCode).toBe("UNSUPPORTED_FORMAT");
      }
    });

    it("falls back to added parser", async () => {
      const composite = new CompositeParser();
      const customParser = {
        canParse: () => true,
        parse: vi.fn().mockResolvedValue({ content: "custom-parsed", metadata: {}, sections: [] }),
      };
      composite.addParser(customParser);
      await composite.parse(Buffer.from("x"), { type: "url", uri: "test.any" });
      expect(customParser.parse).toHaveBeenCalled();
    });
  });

  describe("recursive chunker edge cases", () => {
    it("handles empty content", async () => {
      const chunker = new RecursiveChunker();
      const result = await chunker.chunk(
        { title: "Empty", content: "", sections: [] },
        { maxChunkSize: 10, overlapSize: 0, strategy: "recursive" },
      );
      expect(result).toHaveLength(0);
    });

    it("handles content smaller than chunk size", async () => {
      const chunker = new RecursiveChunker();
      const result = await chunker.chunk(
        { title: "Short", content: "Hello world", sections: [] },
        { maxChunkSize: 100, overlapSize: 0, strategy: "recursive" },
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe("Hello world");
    });

    it("handles overlap correctly", async () => {
      const chunker = new RecursiveChunker();
      const text = "abcdefghijklmnopqrstuvwxyz";
      const result = await chunker.chunk(
        { title: "Overlap", content: text, sections: [] },
        { maxChunkSize: 5, overlapSize: 2, strategy: "recursive" },
      );
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe("heading chunker edge cases", () => {
    it("handles empty sections", async () => {
      const chunker = new HeadingChunker();
      const result = await chunker.chunk(
        { title: "Empty", content: "", sections: [] },
        { maxChunkSize: 100, overlapSize: 0, strategy: "heading" },
      );
      expect(result).toHaveLength(0);
    });

    it("creates chunk when section exceeds maxChunkSize", async () => {
      const chunker = new HeadingChunker();
      const longContent = "a".repeat(200);
      const result = await chunker.chunk(
        {
          title: "Long",
          content: longContent,
          sections: [{ type: "paragraph", content: longContent, locators: [] }],
        },
        { maxChunkSize: 100, overlapSize: 0, strategy: "heading" },
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("composite chunker", () => {
    it("throws for unimplemented strategies", async () => {
      const chunker = new CompositeChunker([new RecursiveChunker()]);
      await expect(
        chunker.chunk(
          { title: "Test", content: "content", sections: [] },
          { maxChunkSize: 10, overlapSize: 0, strategy: "page" },
        ),
      ).rejects.toThrow("not yet implemented");

      await expect(
        chunker.chunk(
          { title: "Test", content: "content", sections: [] },
          { maxChunkSize: 10, overlapSize: 0, strategy: "semantic" },
        ),
      ).rejects.toThrow("not yet implemented");
    });

    it("falls back to recursive for unknown strategy", async () => {
      const chunker = new CompositeChunker([new RecursiveChunker()]);
      const result = await chunker.chunk(
        { title: "Test", content: "hello world test", sections: [] },
        { maxChunkSize: 10, overlapSize: 0, strategy: "unknown" as any },
      );
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
