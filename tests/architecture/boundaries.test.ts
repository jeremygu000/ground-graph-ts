import fs from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const builtinModuleNames = new Set(
  builtinModules.flatMap((name) => [
    name,
    name.startsWith("node:") ? name.slice(5) : `node:${name}`,
  ]),
);

type Layer = "domain" | "application" | "workflows" | "infrastructure" | "apps" | "external";

interface Violation {
  sourceFile: string;
  importSpecifier: string;
  reason: string;
}

function classifyFile(filePath: string): Layer | undefined {
  const relative = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
  if (relative.startsWith("src/domain/")) return "domain";
  if (relative.startsWith("src/application/")) return "application";
  if (relative.startsWith("src/workflows/")) return "workflows";
  if (relative.startsWith("src/infrastructure/")) return "infrastructure";
  if (relative.startsWith("apps/")) return "apps";
  return undefined;
}

function resolveImport(filePath: string, specifier: string): Layer | undefined {
  if (specifier === "zod" || builtinModuleNames.has(specifier)) {
    return "external";
  }

  if (specifier.startsWith("@/")) {
    const resolved = path.resolve(repoRoot, "src", specifier.slice(2));
    return classifyFile(resolved);
  }

  if (!specifier.startsWith(".")) {
    return "external";
  }

  const resolved = path.resolve(path.dirname(filePath), specifier);
  return classifyFile(resolved);
}

function collectImportSpecifiers(sourceText: string): string[] {
  const imports: string[] = [];
  const importExportRegex = /^(?:import|export)\s+[^'"`]*from\s+['"`]([^'"`]+)['"`];?$/gm;
  const sideEffectRegex = /^import\s+['"`]([^'"`]+)['"`];?$/gm;

  for (const match of sourceText.matchAll(importExportRegex)) {
    const specifier = match[1];
    if (specifier) imports.push(specifier);
  }

  for (const match of sourceText.matchAll(sideEffectRegex)) {
    const specifier = match[1];
    if (specifier) imports.push(specifier);
  }

  return imports;
}

function scanSource(filePath: string, sourceText: string): Violation[] {
  const layer = classifyFile(filePath);
  if (!layer) {
    return [];
  }

  const violations: Violation[] = [];
  for (const importSpecifier of collectImportSpecifiers(sourceText)) {
    const targetLayer = resolveImport(filePath, importSpecifier);

    if (layer === "domain") {
      if (
        targetLayer === "external" &&
        !builtinModuleNames.has(importSpecifier) &&
        importSpecifier !== "zod"
      ) {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "domain files may only import standard APIs, zod, or domain-relative modules",
        });
      }
      if (targetLayer && targetLayer !== "domain" && targetLayer !== "external") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason:
            "domain files must not import application, workflows, infrastructure, or apps code",
        });
      }
      continue;
    }

    if (layer === "application") {
      if (
        targetLayer === "external" &&
        !builtinModuleNames.has(importSpecifier) &&
        importSpecifier !== "zod"
      ) {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason:
            "application files may only import standard APIs, zod, domain, or application-relative modules",
        });
      }
      if (
        targetLayer &&
        targetLayer !== "domain" &&
        targetLayer !== "application" &&
        targetLayer !== "external"
      ) {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "application files must not import workflows, infrastructure, or apps code",
        });
      }
      continue;
    }

    if (layer === "workflows") {
      if (
        targetLayer === "external" &&
        !builtinModuleNames.has(importSpecifier) &&
        importSpecifier !== "zod" &&
        importSpecifier !== "@langchain/langgraph"
      ) {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason:
            "workflow files may only import selected orchestration libraries or internal layers",
        });
      }
      if (targetLayer && targetLayer === "apps") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "workflow files must not import apps code",
        });
      }
      continue;
    }

    if (layer === "infrastructure") {
      if (targetLayer === "apps" || targetLayer === "workflows") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "infrastructure files must not import apps or workflows code",
        });
      }
    }
  }

  return violations;
}

async function walkTsFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("architecture boundaries", () => {
  it("rejects an intentional dependency violation fixture", () => {
    const violations = scanSource(
      path.join(repoRoot, "src/domain/fixture.ts"),
      [
        'import Fastify from "fastify";',
        'import { drizzle } from "drizzle-orm";',
        'import { Neo4jClient } from "@/infrastructure/neo4j/client";',
      ].join("\n"),
    );

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.importSpecifier)).toEqual(
      expect.arrayContaining(["fastify", "drizzle-orm", "@/infrastructure/neo4j/client"]),
    );
  });

  it("keeps domain, application, workflows, and api imports within allowed boundaries", async () => {
    const files = await Promise.all([
      walkTsFiles(path.join(repoRoot, "src/domain")),
      walkTsFiles(path.join(repoRoot, "src/application")),
      walkTsFiles(path.join(repoRoot, "src/workflows")),
      walkTsFiles(path.join(repoRoot, "apps")),
    ]);

    const allFiles = files.flat();
    const discoveredViolations: Violation[] = [];
    for (const filePath of allFiles) {
      const sourceText = await fs.readFile(filePath, "utf8");
      discoveredViolations.push(...scanSource(filePath, sourceText));
    }

    expect(discoveredViolations).toEqual([]);
  });
});
