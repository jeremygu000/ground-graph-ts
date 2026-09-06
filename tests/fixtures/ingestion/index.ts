import { readFileSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(__dirname);

export interface TestFixture {
  name: string;
  content: Buffer;
  mimeType: string;
  uri: string;
}

export function loadFixture(name: string): TestFixture {
  const filePath = join(FIXTURES_DIR, name);
  const content = readFileSync(filePath);

  let mimeType = "application/octet-stream";
  if (name.endsWith(".md") || name.endsWith(".markdown")) {
    mimeType = "text/markdown";
  } else if (name.endsWith(".txt")) {
    mimeType = "text/plain";
  } else if (name.endsWith(".html") || name.endsWith(".htm")) {
    mimeType = "text/html";
  } else if (name.endsWith(".pdf")) {
    mimeType = "application/pdf";
  } else if (name.endsWith(".docx")) {
    mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (name.endsWith(".epub")) {
    mimeType = "application/epub+zip";
  }

  return {
    name,
    content,
    mimeType,
    uri: `file://${filePath}`,
  };
}

export const FIXTURES = {
  "markdown-basic.md": loadFixture("markdown-basic.md"),
  "markdown-empty.md": loadFixture("markdown-empty.md"),
  "markdown-malformed.md": loadFixture("markdown-malformed.md"),
  "text-basic.txt": loadFixture("text-basic.txt"),
};
