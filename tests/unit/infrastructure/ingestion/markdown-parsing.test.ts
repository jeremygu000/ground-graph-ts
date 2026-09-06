import { describe, expect, it } from "vitest";
import { MarkdownParser } from "../../../../src/infrastructure/ingestion/parsers";

describe("MarkdownParser code block extraction", () => {
  it("extracts single code block", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from("Some text\n\n```ts\nconst x = 1;\n```\n\nMore text", "utf8"),
      { type: "url", uri: "test.md" },
    );

    const codeSections = result.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBe(1);
    expect(codeSections[0]!.content).toContain("const x = 1");
  });

  it("extracts multiple code blocks", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from(
        "Before\n\n```js\nfirst code block\n```\n\nMiddle\n\n```python\nsecond code block\n```\n\nAfter",
        "utf8",
      ),
      { type: "url", uri: "test.md" },
    );

    const codeSections = result.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBe(2);
  });

  it("extracts code block at document start", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from("```js\nconst x = 1;\n```\n\nText after", "utf8"),
      { type: "url", uri: "test.md" },
    );

    const codeSections = result.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBe(1);
    expect(codeSections[0]!.content).toContain("const x = 1");
  });

  it("handles empty code block", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(Buffer.from("Text\n\n```\n```\n\nMore text", "utf8"), {
      type: "url",
      uri: "test.md",
    });

    const codeSections = result.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBe(1);
  });

  it("extracts code blocks with various language specifiers", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from(
        "```python\nprint('hello')\n```\n\n```rust\nfn main() {}\n```\n\n```\nno language\n```",
        "utf8",
      ),
      { type: "url", uri: "test.md" },
    );

    const codeSections = result.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBe(3);
  });

  it("handles code block followed by heading", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(Buffer.from("```\ncode\n```\n\n## Heading", "utf8"), {
      type: "url",
      uri: "test.md",
    });

    const headings = result.sections.filter((s) => s.type === "heading");
    expect(headings.length).toBe(1);
    expect(headings[0]!.content).toBe("Heading");
  });

  it("extracts headings at different levels", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(Buffer.from("# H1\n\n## H2\n\n### H3\n\nParagraph", "utf8"), {
      type: "url",
      uri: "test.md",
    });

    const headings = result.sections.filter((s) => s.type === "heading");
    expect(headings.length).toBe(3);
    expect(headings[0]!.content).toBe("H1");
    expect(headings[0]!.level).toBe(1);
    expect(headings[1]!.content).toBe("H2");
    expect(headings[1]!.level).toBe(2);
    expect(headings[2]!.content).toBe("H3");
    expect(headings[2]!.level).toBe(3);
  });

  it("extracts title from first heading", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(Buffer.from("# Document Title\n\nSome content", "utf8"), {
      type: "url",
      uri: "test.md",
    });

    expect(result.title).toBe("Document Title");
  });

  it("handles document without headings", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from("Just some plain text without any headings", "utf8"),
      { type: "url", uri: "test.md" },
    );

    expect(result.title).toBeUndefined();
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it("handles multiline paragraph content", async () => {
    const parser = new MarkdownParser();
    const result = await parser.parse(
      Buffer.from(
        "First paragraph\nwith multiple lines\n\nSecond paragraph\nalso multiline",
        "utf8",
      ),
      { type: "url", uri: "test.md" },
    );

    expect(result.sections.length).toBeGreaterThan(0);
  });
});
