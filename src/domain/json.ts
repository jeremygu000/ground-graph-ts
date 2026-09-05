import { z } from "zod";

const stringSchema = z.string();
const numberSchema = z.number().finite();
const booleanSchema = z.boolean();
const nullSchema = z.null();

const jsonValueLazy: z.ZodLazy<z.ZodType<unknown>> = z.lazy(() =>
  z.union([
    stringSchema,
    numberSchema,
    booleanSchema,
    nullSchema,
    z.array(jsonValueLazy),
    z.record(z.string(), jsonValueLazy),
  ]),
);

export const JSON_VALUE_SCHEMA: z.ZodSchema<unknown> = jsonValueLazy;

export type JSONValue = unknown;

export function isJSONValue(value: unknown): value is JSONValue {
  return JSON_VALUE_SCHEMA.safeParse(value).success;
}

export function assertJSONValue(value: unknown): asserts value is JSONValue {
  const result = JSON_VALUE_SCHEMA.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid JSON value: ${result.error.message}`);
  }
}

export const JSON_OBJECT_SCHEMA = z.record(z.string(), JSON_VALUE_SCHEMA);

export type JSONObject = Record<string, JSONValue>;

export function isJSONObject(value: unknown): value is JSONObject {
  return JSON_OBJECT_SCHEMA.safeParse(value).success;
}

export function assertJSONObject(value: unknown): asserts value is JSONObject {
  const result = JSON_OBJECT_SCHEMA.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid JSON object: ${result.error.message}`);
  }
}
