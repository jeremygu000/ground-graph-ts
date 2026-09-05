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
  CompositeParser,
  HtmlParser,
  MarkdownParser,
  PlainTextParser,
} from "../../../src/infrastructure/ingestion/parsers";
import {
  CompositeContentFetcher,
  DefaultContentFetcherFactory,
  FileContentFetcher,
  S3ContentFetcher,
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
      ).resolves.toHaveLength(1);
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
});
