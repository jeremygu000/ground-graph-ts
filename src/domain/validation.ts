import { type ZodType } from "zod";

export function validateOrThrow<T>(schema: ZodType<T>, data: unknown, context?: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path ?? [];
    throw new Error(
      `Validation failed${context ? ` in ${context}` : ""}: ${issue?.message ?? "unknown"} at ${path.join(".")}`,
    );
  }
  return result.data;
}

export function validateOrDefault<T>(schema: ZodType<T>, data: unknown, defaultValue: T): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    return defaultValue;
  }
  return result.data;
}

export function isValidSchema<T>(schema: ZodType<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}

export function parseJson<T>(schema: ZodType<T>, json: string, context?: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Invalid JSON${context ? ` in ${context}` : ""}`);
  }
  return validateOrThrow(schema, parsed, context);
}
