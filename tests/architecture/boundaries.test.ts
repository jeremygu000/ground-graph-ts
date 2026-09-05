import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";

type Layer =
  | "domain"
  | "application"
  | "workflows"
  | "infrastructure"
  | "apps"
  | "external"
  | "builtin";

interface Violation {
  sourceFile: string;
  importSpecifier: string;
  reason: string;
}

const repoRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const architectureRulesPath = path.join(repoRoot, "docs/architecture-rules.json");
const architectureRules = JSON.parse(fs.readFileSync(architectureRulesPath, "utf8")) as {
  rules: Array<{ id: string; from?: string; canImport?: string[]; cannotImport?: string[] }>;
};
const builtinModuleNames = new Set(
  builtinModules.flatMap((name) => [
    name,
    name.startsWith("node:") ? name.slice(5) : `node:${name}`,
  ]),
);

function classifyFile(filePath: string): Layer | undefined {
  const relative = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
  if (relative.startsWith("src/domain/")) return "domain";
  if (relative.startsWith("src/application/")) return "application";
  if (relative.startsWith("src/workflows/")) return "workflows";
  if (relative.startsWith("src/infrastructure/")) return "infrastructure";
  if (relative.startsWith("apps/")) return "apps";
  return undefined;
}

function isBuiltinSpecifier(specifier: string): boolean {
  return builtinModuleNames.has(specifier);
}

function packageNameFromSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, packageName] = specifier.split("/");
    return packageName ? `${scope}/${packageName}` : specifier;
  }
  const [packageName] = specifier.split("/");
  return packageName ?? specifier;
}

function resolveImportLayer(filePath: string, specifier: string): Layer | undefined {
  if (specifier === "zod" || isBuiltinSpecifier(specifier)) {
    return specifier === "zod" ? "external" : "builtin";
  }

  if (specifier.startsWith("@/")) {
    return classifyFile(path.resolve(repoRoot, "src", specifier.slice(2)));
  }

  if (!specifier.startsWith(".")) {
    return "external";
  }

  return classifyFile(path.resolve(path.dirname(filePath), specifier));
}

function collectImportSpecifiers(filePath: string, sourceText: string): string[] {
  const sourceFile = parse(sourceText, {
    sourceFilename: filePath,
    sourceType: "module",
    plugins: ["typescript" as any],
  }) as any;
  const specifiers: string[] = [];

  const visit = (node: any): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    if (
      node.type === "ImportDeclaration" ||
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration"
    ) {
      const moduleSpecifier = node.source;
      if (moduleSpecifier && typeof moduleSpecifier.value === "string") {
        specifiers.push(moduleSpecifier.value);
      }
    }

    if (node.type === "ImportExpression") {
      if (node.source && typeof node.source.value === "string") {
        specifiers.push(node.source.value);
      }
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      const firstArgument = node.arguments?.[0];
      if (callee?.type === "Import" && firstArgument && typeof firstArgument.value === "string") {
        specifiers.push(firstArgument.value);
      }
      if (
        callee?.type === "Identifier" &&
        callee.name === "require" &&
        firstArgument &&
        typeof firstArgument.value === "string"
      ) {
        specifiers.push(firstArgument.value);
      }
    }

    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          visit(child);
        }
        continue;
      }
      visit(value);
    }
  };

  visit(sourceFile);
  return specifiers;
}

function scanSource(filePath: string, sourceText: string): Violation[] {
  const layer = classifyFile(filePath);
  if (!layer) return [];

  const violations: Violation[] = [];

  for (const importSpecifier of collectImportSpecifiers(filePath, sourceText)) {
    const targetLayer = resolveImportLayer(filePath, importSpecifier);
    const packageName = packageNameFromSpecifier(importSpecifier);

    if (layer === "domain") {
      if (targetLayer === "external" && importSpecifier !== "zod") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "domain files may only import standard APIs, zod, or domain-local modules",
        });
      }
      if (
        targetLayer &&
        targetLayer !== "domain" &&
        targetLayer !== "builtin" &&
        targetLayer !== "external"
      ) {
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
      if (targetLayer === "external" && importSpecifier !== "zod") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason:
            "application files may only import standard APIs, zod, domain, or application-local modules",
        });
      }
      if (
        targetLayer === "workflows" ||
        targetLayer === "infrastructure" ||
        targetLayer === "apps"
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
      if (targetLayer === "domain" || targetLayer === "infrastructure" || targetLayer === "apps") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "workflow files may only import application code",
        });
      }
      if (targetLayer === "external" || targetLayer === "builtin") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "workflow files may only import application code",
        });
      }
      continue;
    }

    if (layer === "infrastructure") {
      if (targetLayer === "workflows" || targetLayer === "apps") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "infrastructure files must not import workflows or apps code",
        });
      }
      continue;
    }

    if (layer === "apps") {
      if (targetLayer === "domain" || targetLayer === "workflows") {
        violations.push({
          sourceFile: filePath,
          importSpecifier,
          reason: "apps files must not import domain or workflows code directly",
        });
      }
      if (targetLayer === "external") {
        const allowedPackages = new Set([
          "fastify",
          "@fastify/cors",
          "@fastify/swagger",
          "@fastify/swagger-ui",
          "zod",
        ]);
        if (!allowedPackages.has(importSpecifier) && !packageName.startsWith("@fastify/")) {
          violations.push({
            sourceFile: filePath,
            importSpecifier,
            reason:
              "apps files may only import application, infrastructure, or approved bootstrap packages",
          });
        }
      }
    }
  }

  return violations;
}

async function walkTsFiles(root: string): Promise<string[]> {
  const entries = await fsPromises.readdir(root, { withFileTypes: true });
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
  it("uses the checked-in architecture rules as the contract source", () => {
    const workflowsRule = architectureRules.rules.find(
      (rule) => rule.id === "WORKFLOWS_APPLICATION_ONLY",
    );
    expect(workflowsRule?.from).toBe("workflows");
    expect(workflowsRule?.canImport).toEqual(["application"]);
  });

  it("rejects intentional dependency violation fixtures", () => {
    const workflowViolations = scanSource(
      path.join(repoRoot, "src/workflows/ingestion/fixture.ts"),
      [
        'import type { Chunk } from "../../domain/documents/types";',
        'import { createHash } from "crypto";',
      ].join("\n"),
    );

    expect(workflowViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ importSpecifier: "../../domain/documents/types" }),
        expect.objectContaining({ importSpecifier: "crypto" }),
      ]),
    );

    const appViolations = scanSource(
      path.join(repoRoot, "apps/api/src/fixture.ts"),
      [
        'import type { Chunk } from "@/domain/documents/types";',
        'import { IngestionWorkflow } from "@/workflows/ingestion/ingestion-workflow";',
      ].join("\n"),
    );

    expect(appViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ importSpecifier: "@/domain/documents/types" }),
        expect.objectContaining({ importSpecifier: "@/workflows/ingestion/ingestion-workflow" }),
      ]),
    );
  });

  it("keeps domain, application, workflows, infrastructure, and apps imports within boundaries", async () => {
    const files = await Promise.all([
      walkTsFiles(path.join(repoRoot, "src/domain")),
      walkTsFiles(path.join(repoRoot, "src/application")),
      walkTsFiles(path.join(repoRoot, "src/workflows")),
      walkTsFiles(path.join(repoRoot, "src/infrastructure")),
      walkTsFiles(path.join(repoRoot, "apps")),
    ]);

    const allFiles = files.flat();
    const discoveredViolations: Violation[] = [];
    for (const filePath of allFiles) {
      const sourceText = await fsPromises.readFile(filePath, "utf8");
      discoveredViolations.push(...scanSource(filePath, sourceText));
    }

    expect(discoveredViolations).toEqual([]);
  });
});
