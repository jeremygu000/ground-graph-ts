import { describe, expect, it } from "vitest";
import { StructuredCodeExtractor, UrlExtractor, ConfigExtractor } from "@/application/extraction";

const createChunk = (content: string, locatorPath = "src/index.ts") =>
  ({
    id: "00000000-0000-0000-0000-000000000001",
    documentVersionId: "00000000-0000-0000-0000-000000000002",
    principalId: "00000000-0000-0000-0000-000000000003",
    sequenceNumber: 1,
    content,
    contentHash: "hash",
    locator: { type: "line" as const, path: locatorPath },
    metadata: {},
    createdAt: new Date().toISOString(),
  }) as Parameters<typeof StructuredCodeExtractor.prototype.extract>[0];

describe("StructuredCodeExtractor", () => {
  const extractor = new StructuredCodeExtractor();

  it("uses locator.path as the Module entity name instead of a global sentinel", () => {
    const chunk = createChunk(`export function foo() {}`, "src/foo.ts");

    const result = extractor.extract(chunk);

    const moduleEntities = result.entities.filter((e) => e.type === "Module");
    expect(moduleEntities).toHaveLength(1);
    expect(moduleEntities[0]?.name).toBe("src/foo.ts");
  });

  it("produces different Module entities for different files", () => {
    const chunkA = createChunk(`export function a() {}`, "src/a.ts");
    const chunkB = createChunk(`export function b() {}`, "src/b.ts");

    const resultA = extractor.extract(chunkA);
    const resultB = extractor.extract(chunkB);

    expect(resultA.entities[0]?.name).toBe("src/a.ts");
    expect(resultB.entities[0]?.name).toBe("src/b.ts");
    expect(resultA.entities[0]?.name).not.toBe(resultB.entities[0]?.name);
  });

  it("extracts only exported functions as exports facts", () => {
    const chunk = createChunk(
      `
import { foo } from 'bar';
import { baz } from 'qux';

export function exportedFunc() {}
function internalFunc() {}
    `.trim(),
    );

    const result = extractor.extract(chunk);

    const funcEntities = result.entities.filter((e) => e.type === "Function");
    expect(funcEntities.some((e) => e.name === "exportedFunc")).toBe(true);
    expect(funcEntities.some((e) => e.name === "internalFunc")).toBe(true);

    const exportsFacts = result.facts.filter((f) => f.predicate === "exports");
    expect(exportsFacts).toHaveLength(1);
    expect(exportsFacts[0]?.objectName).toBe("exportedFunc");
  });

  it("extracts only exported classes as exports facts", () => {
    const chunk = createChunk(
      `
import { foo } from 'bar';

export class ExportedClass {}
class InternalClass {}
    `.trim(),
    );

    const result = extractor.extract(chunk);

    const classEntities = result.entities.filter((e) => e.type === "Class");
    expect(classEntities.some((e) => e.name === "ExportedClass")).toBe(true);
    expect(classEntities.some((e) => e.name === "InternalClass")).toBe(true);

    const exportsFacts = result.facts.filter((f) => f.predicate === "exports");
    expect(exportsFacts).toHaveLength(1);
    expect(exportsFacts[0]?.objectName).toBe("ExportedClass");
  });

  it("only exports functions from the last module before them", () => {
    const chunk = createChunk(
      `
import { a } from 'module-a';
export function funcA() {}

import { b } from 'module-b';
export function funcB() {}
    `.trim(),
    );

    const result = extractor.extract(chunk);

    const exportsFacts = result.facts.filter((f) => f.predicate === "exports");
    expect(exportsFacts.length).toBe(2);

    const funcAExports = exportsFacts.filter((f) => f.objectName === "funcA");
    const funcBExports = exportsFacts.filter((f) => f.objectName === "funcB");

    expect(funcAExports.length).toBe(1);
    expect(funcBExports.length).toBe(1);
    expect(funcAExports[0]?.subjectName).toBeTruthy();
    expect(funcBExports[0]?.subjectName).toBeTruthy();
  });

  it("sets lower confidence for non-exported entities", () => {
    const chunk = createChunk(
      `
function internalFunc() {}
class InternalClass {}
    `.trim(),
    );

    const result = extractor.extract(chunk);

    const internalFunc = result.entities.find((e) => e.name === "internalFunc");
    expect(internalFunc?.confidence).toBe(0.8);

    const internalClass = result.entities.find((e) => e.name === "InternalClass");
    expect(internalClass?.confidence).toBe(0.8);
  });
});

describe("UrlExtractor", () => {
  const extractor = new UrlExtractor();

  it("extracts URLs without secrets", () => {
    const chunk = createChunk("Check out https://api.example.com/v1/users for more info.");

    const result = extractor.extract(chunk);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toBe("api.example.com");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.objectValue).toBe("https://api.example.com/v1/users");
    expect(result.facts[0]?.confidence).toBe(0.9);
  });

  it("redacts API keys in URLs", () => {
    const chunk = createChunk("https://api.example.com?api_key=secret123");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).toContain("***REDACTED***");
    expect(result.facts[0]?.confidence).toBe(0.5);
  });

  it("redacts tokens in URLs", () => {
    const chunk = createChunk("https://api.example.com?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).toContain("***REDACTED***");
  });

  it("redacts Bearer tokens in query params", () => {
    const chunk = createChunk("https://api.example.com/oauth?access_token=secret-token");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).toContain("***REDACTED***");
  });

  it("does not redact non-secret query params", () => {
    const chunk = createChunk("https://api.example.com?page=1&limit=10");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).toBe("https://api.example.com?page=1&limit=10");
    expect(result.facts[0]?.confidence).toBe(0.9);
  });

  it("strips username:password from URLs", () => {
    const chunk = createChunk("Connect to https://admin:secret123@db.example.com/data");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).toBe("https://***REDACTED***@db.example.com/data");
    expect(result.facts[0]?.confidence).toBe(0.5);
  });

  it("strips credentials even when no query params", () => {
    const chunk = createChunk("https://user:pass@host/path");

    const result = extractor.extract(chunk);

    expect(result.facts[0]?.objectValue).not.toContain("user");
    expect(result.facts[0]?.objectValue).not.toContain("pass");
    expect(result.facts[0]?.objectValue).toContain("***REDACTED***");
  });
});

describe("ConfigExtractor", () => {
  const extractor = new ConfigExtractor();

  it("extracts non-secret environment variables", () => {
    const chunk = createChunk(
      `
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://localhost:5432/mydb
    `.trim(),
    );

    const result = extractor.extract(chunk);

    expect(result.entities).toHaveLength(3);
    expect(result.facts).toHaveLength(0);
  });

  it("lowers confidence for secret env vars", () => {
    const chunk = createChunk(
      `
API_KEY=sk-1234567890abcdef
SECRET_TOKEN=my-secret-token
DATABASE_PASSWORD=supersecret
    `.trim(),
    );

    const result = extractor.extract(chunk);

    expect(result.entities).toHaveLength(3);
    result.entities.forEach((entity) => {
      expect(entity.confidence).toBe(0.5);
    });
    expect(result.facts).toHaveLength(0);
  });

  it("detects GitHub tokens", () => {
    const chunk = createChunk("GITHUB_TOKEN=ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

    const result = extractor.extract(chunk);

    expect(result.entities[0]?.confidence).toBe(0.5);
    expect(result.facts).toHaveLength(0);
  });

  it("detects long hex strings as potential secrets", () => {
    const chunk = createChunk("JWT_SECRET=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");

    const result = extractor.extract(chunk);

    expect(result.entities[0]?.confidence).toBe(0.5);
    expect(result.facts).toHaveLength(0);
  });
});
