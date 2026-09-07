import type { Result } from "../../domain/result";
import { DEFAULT_ONTOLOGY_TYPES, DEFAULT_PREDICATES } from "../../../ontology/types";
import type { Chunk } from "../../domain/documents/documents.schema";
import type {
  DeterministicExtractor,
  ExtractionCandidate,
  ExtractionServiceDeps,
} from "./extraction.types";

export type {
  DeterministicExtractor,
  ExtractionCandidate,
  ExtractionServiceDeps,
} from "./extraction.types";
export type { ReconciliationReport } from "./reconciliation.types";

export class StructuredCodeExtractor implements DeterministicExtractor {
  extract(content: Chunk): ExtractionCandidate {
    const candidate: ExtractionCandidate = { entities: [], facts: [] };
    const text = content.content;

    const moduleMap = new Map<string, { entities: string[]; classes: string[] }>();
    let currentModule = "";

    const importMatches = text.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const module = match[1];
      if (module) {
        currentModule = module;
        if (!moduleMap.has(module)) {
          moduleMap.set(module, { entities: [], classes: [] });
          candidate.entities.push({
            name: module,
            type: "Module",
            confidence: 1.0,
          });
        }
      }
    }

    const exportFunctionMatches = text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const match of exportFunctionMatches) {
      const funcName = match[1];
      if (funcName) {
        candidate.entities.push({
          name: funcName,
          type: "Function",
          aliases: [`${funcName}()`],
          confidence: 1.0,
        });
        if (currentModule && moduleMap.has(currentModule)) {
          moduleMap.get(currentModule)!.entities.push(funcName);
          candidate.facts.push({
            subjectName: currentModule,
            predicate: "exports",
            objectName: funcName,
            confidence: 1.0,
          });
        }
      }
    }

    const localFunctionMatches = text.matchAll(/(?<!export\s)(?:async\s+)?function\s+(\w+)/g);
    for (const match of localFunctionMatches) {
      const funcName = match[1];
      if (funcName) {
        candidate.entities.push({
          name: funcName,
          type: "Function",
          aliases: [`${funcName}()`],
          confidence: 0.8,
        });
      }
    }

    const exportClassMatches = text.matchAll(/export\s+class\s+(\w+)/g);
    for (const match of exportClassMatches) {
      const className = match[1];
      if (className) {
        candidate.entities.push({
          name: className,
          type: "Class",
          confidence: 1.0,
        });
        if (currentModule && moduleMap.has(currentModule)) {
          moduleMap.get(currentModule)!.classes.push(className);
          candidate.facts.push({
            subjectName: currentModule,
            predicate: "exports",
            objectName: className,
            confidence: 1.0,
          });
        }
      }
    }

    const localClassMatches = text.matchAll(/(?<!export\s)class\s+(\w+)/g);
    for (const match of localClassMatches) {
      const className = match[1];
      if (className) {
        candidate.entities.push({
          name: className,
          type: "Class",
          confidence: 0.8,
        });
      }
    }

    return candidate;
  }
}

export class UrlExtractor implements DeterministicExtractor {
  private readonly secretPatterns = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /auth/i,
    /credential/i,
    /bearer/i,
    /jwt/i,
    /session/i,
    /sig/i,
    /signature/i,
    /oauth/i,
  ];

  private looksLikeSecret(key: string, value: string): boolean {
    if (this.secretPatterns.some((p) => p.test(key))) return true;
    if (key.toLowerCase().includes("key") && value.length > 8) return true;
    if (value.startsWith("sk-") || value.startsWith("pk_") || value.startsWith("ghs_")) return true;
    if (/^[a-f0-9]{32,}$/i.test(value)) return true;
    return false;
  }

  extract(content: Chunk): ExtractionCandidate {
    const candidate: ExtractionCandidate = { entities: [], facts: [] };
    const text = content.content;

    const urlMatches = text.matchAll(/https?:\/\/[^\s'"<>]+/g);
    for (const match of urlMatches) {
      const url = match[0];
      if (!url) continue;
      try {
        const parsed = new URL(url);
        let redactedUrl = url;
        const hasSecret = Array.from(parsed.searchParams.entries()).some(([key, value]) => {
          if (this.looksLikeSecret(key, value)) {
            return true;
          }
          return false;
        });

        if (hasSecret) {
          const redactedParams = new URLSearchParams();
          for (const [key, value] of parsed.searchParams.entries()) {
            if (this.looksLikeSecret(key, value)) {
              redactedParams.set(key, "***REDACTED***");
            } else {
              redactedParams.set(key, value);
            }
          }
          parsed.search = redactedParams.toString();
          redactedUrl = parsed.toString();
        }

        candidate.entities.push({
          name: parsed.hostname,
          type: "URL",
          aliases: [url],
          confidence: 0.9,
        });
        candidate.facts.push({
          subjectName: parsed.hostname,
          predicate: "references",
          objectValue: redactedUrl,
          confidence: hasSecret ? 0.5 : 0.9,
        });
      } catch {
        // Invalid URL, skip
      }
    }

    return candidate;
  }
}

export class AdrExtractor implements DeterministicExtractor {
  extract(content: Chunk): ExtractionCandidate {
    const candidate: ExtractionCandidate = { entities: [], facts: [] };
    const text = content.content;

    const adrNumberMatch = text.match(/ADR-(\d+)/i);
    if (adrNumberMatch && adrNumberMatch[1]) {
      const adrId = `ADR-${adrNumberMatch[1]}`;
      candidate.entities.push({
        name: adrId,
        type: "ADR",
        confidence: 1.0,
      });

      const titleMatch = text.match(/^#\s+(.+)$/m);
      if (titleMatch && titleMatch[1]) {
        candidate.facts.push({
          subjectName: adrId,
          predicate: "has_title",
          objectValue: titleMatch[1],
          confidence: 1.0,
        });
      }

      const statusMatch = text.match(/status:\s*(\w+)/i);
      if (statusMatch && statusMatch[1]) {
        candidate.facts.push({
          subjectName: adrId,
          predicate: "has_status",
          objectValue: statusMatch[1],
          confidence: 1.0,
        });
      }

      const supersedesMatch = text.match(/supersedes:\s*ADR-(\d+)/i);
      if (supersedesMatch && supersedesMatch[1]) {
        candidate.facts.push({
          subjectName: adrId,
          predicate: "supersedes",
          objectValue: `ADR-${supersedesMatch[1]}`,
          confidence: 1.0,
        });
      }
    }

    return candidate;
  }
}

export class ConfigExtractor implements DeterministicExtractor {
  private readonly secretPatterns = [
    /key/i,
    /secret/i,
    /password/i,
    /token/i,
    /auth/i,
    /credential/i,
    /private/i,
    /bearer/i,
    /jwt/i,
  ];

  private looksLikeSecret(key: string, value: string): boolean {
    if (this.secretPatterns.some((p) => p.test(key))) return true;
    if (value.startsWith("sk-") || value.startsWith("pk_") || value.startsWith("ghs_")) return true;
    if (/^[a-f0-9]{32,}$/i.test(value)) return true;
    if (/^Bearer\s+.+$/i.test(value)) return true;
    return false;
  }

  extract(content: Chunk): ExtractionCandidate {
    const candidate: ExtractionCandidate = { entities: [], facts: [] };
    const text = content.content;

    const envMatches = text.matchAll(/^(\w+)=(.+)$/gm);
    for (const match of envMatches) {
      const key = match[1];
      const value = match[2];
      if (key && value && !key.startsWith("#") && value.length > 0) {
        const isSecret = this.looksLikeSecret(key, value);
        candidate.entities.push({
          name: key,
          type: "EnvironmentVariable",
          confidence: isSecret ? 0.5 : 1.0,
        });
        if (!isSecret) {
          candidate.facts.push({
            subjectName: key,
            predicate: "has_value",
            objectValue: value,
            confidence: 1.0,
          });
        }
      }
    }

    return candidate;
  }
}

export function createExtractorForType(type: string): DeterministicExtractor | null {
  switch (type.toLowerCase()) {
    case "typescript":
    case "javascript":
    case "code":
    case "python":
    case "java":
    case "go":
    case "rust":
      return new StructuredCodeExtractor();
    case "url":
    case "web":
      return new UrlExtractor();
    case "adr":
    case "markdown":
      return new AdrExtractor();
    case "env":
    case "config":
    case "yaml":
    case "toml":
      return new ConfigExtractor();
    default:
      return null;
  }
}

export class ExtractionService {
  constructor(private deps: ExtractionServiceDeps) {}

  async initializeOntology(tenantId: string): Promise<Result<void>> {
    for (const typeName of DEFAULT_ONTOLOGY_TYPES) {
      const existing = await this.deps.entityTypeRepository.findByName(typeName, tenantId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        const entityType = {
          id: crypto.randomUUID(),
          tenantId,
          name: typeName,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          attributes: {},
        };
        const createResult = await this.deps.entityTypeRepository.create(entityType);
        if (!createResult.ok) {
          return createResult;
        }
      }
    }

    for (const predicateName of DEFAULT_PREDICATES) {
      const existing = await this.deps.predicateRepository.findByName(predicateName, tenantId);
      if (!existing.ok) {
        return existing;
      }
      if (!existing.value) {
        const predicate = {
          id: crypto.randomUUID(),
          tenantId,
          name: predicateName,
          domainTypes: [] as string[],
          rangeTypes: [] as string[],
          isTransitive: false,
          isSymmetric: false,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const createResult = await this.deps.predicateRepository.create(predicate);
        if (!createResult.ok) {
          return createResult;
        }
      }
    }

    return { ok: true, value: undefined };
  }
}
