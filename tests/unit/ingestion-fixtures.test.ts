import { describe, expect, it } from "vitest";
import { MarkdownParser, PlainTextParser } from "../../src/infrastructure/ingestion/parsers";
import { FIXTURES } from "../fixtures/ingestion";

describe("Ingestion Fixtures", () => {
  const markdownParser = new MarkdownParser();
  const textParser = new PlainTextParser();

  it("parses basic markdown fixture correctly", async () => {
    const fixture = FIXTURES["markdown-basic.md"];
    const parsed = await markdownParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    expect(parsed.content).toContain("Test Document");
    expect(parsed.title).toBe("Test Document");
    expect(parsed.sections.length).toBeGreaterThan(0);
  });

  it("handles empty markdown fixture", async () => {
    const fixture = FIXTURES["markdown-empty.md"];
    const parsed = await markdownParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    expect(parsed.content).toBeDefined();
    expect(parsed.sections.length).toBeGreaterThanOrEqual(0);
  });

  it("handles malformed markdown fixture gracefully", async () => {
    const fixture = FIXTURES["markdown-malformed.md"];
    const parsed = await markdownParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    expect(parsed.content).toContain("Malformed Document");
    expect(parsed.sections.length).toBeGreaterThanOrEqual(0);
  });

  it("parses plain text fixture correctly", async () => {
    const fixture = FIXTURES["text-basic.txt"];
    const parsed = await textParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    expect(parsed.content).toContain("Simple plain text content");
    expect(parsed.sections.length).toBeGreaterThan(0);
  });

  it("detects code blocks in markdown", async () => {
    const fixture = FIXTURES["markdown-basic.md"];
    const parsed = await markdownParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    const codeSections = parsed.sections.filter((s) => s.type === "code");
    expect(codeSections.length).toBeGreaterThan(0);
    expect(codeSections[0].content).toContain("function hello");
  });

  it("detects headings in markdown", async () => {
    const fixture = FIXTURES["markdown-basic.md"];
    const parsed = await markdownParser.parse(fixture.content, {
      type: "file",
      uri: fixture.uri,
      mimeType: fixture.mimeType,
    });

    const headings = parsed.sections.filter((s) => s.type === "heading");
    expect(headings.length).toBeGreaterThan(0);
  });
});
