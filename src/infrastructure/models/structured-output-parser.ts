import { z } from "zod";
import { success, failure, type Result } from "../../domain/result";
import { ValidationError } from "../../domain/errors";
import type { RepairStrategy, StructuredOutputParser } from "../../application/models/ports";

export class ZodStructuredOutputParser<T> implements StructuredOutputParser<T> {
  constructor(public readonly schema: z.ZodType<T>) {}

  parse(input: unknown): Result<T> {
    const result = this.schema.safeParse(input);
    if (result.success) {
      return success(result.data);
    }
    return failure(
      new ValidationError("Structured output validation failed", {
        issues: result.error.issues,
      }),
    );
  }

  parseWithRepair(input: unknown, rawText: string): Result<T> {
    const first = this.schema.safeParse(input);
    if (first.success) {
      return success(first.data);
    }
    const repair = new DefaultRepairStrategy();
    let current = rawText;
    for (let attempt = 0; attempt < 2; attempt++) {
      current = repair.attempt(current, first.error.issues);
      const recovered = tryRecoverJson(current);
      if (recovered === undefined) {
        continue;
      }
      const second = this.schema.safeParse(recovered);
      if (second.success) {
        return success(second.data);
      }
    }
    return failure(
      new ValidationError("Structured output could not be repaired", {
        issues: first.error.issues,
      }),
    );
  }
}

export class DefaultRepairStrategy implements RepairStrategy {
  attempt(rawText: string, _issues: z.ZodIssue[]): string {
    let text = rawText.trim();
    text = stripCodeFence(text);
    if (!text.startsWith("{")) {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }
    }
    text = text.replace(/,\s*([}\]])/g, "$1");
    text = text.replace(/`+/g, "");
    return text;
  }
}

function stripCodeFence(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1]?.trim() ?? text;
  }
  return text;
}

export function tryRecoverJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const balanced = extractBalancedJsonObject(text);
  if (balanced === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(balanced);
  } catch {
    return undefined;
  }
}

export function extractBalancedJsonObject(text: string): string | undefined {
  const first = text.indexOf("{");
  if (first === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = first; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(first, i + 1);
      }
    }
  }
  return undefined;
}
