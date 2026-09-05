import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  assertJSONObject,
  assertJSONValue,
  JSON_OBJECT_SCHEMA,
  JSON_VALUE_SCHEMA,
  isJSONObject,
  isJSONValue,
} from "../../../src/domain/json";
import {
  isValidSchema,
  parseJson,
  validateOrDefault,
  validateOrThrow,
} from "../../../src/domain/validation";

describe("domain validation", () => {
  it("validates and parses JSON values", () => {
    expect(isJSONValue({ nested: [1, true, null] })).toBe(true);
    expect(isJSONObject({ nested: { ok: true } })).toBe(true);
    expect(() => assertJSONValue(new Date())).toThrow("Invalid JSON value");
    expect(() => assertJSONObject([])).toThrow("Invalid JSON object");
    expect(JSON_VALUE_SCHEMA.safeParse({ ok: true }).success).toBe(true);
    expect(JSON_OBJECT_SCHEMA.safeParse({ ok: true }).success).toBe(true);
  });

  it("validates schemas and parses JSON strings", () => {
    const schema = z.object({ ok: z.boolean() });

    expect(validateOrThrow(schema, { ok: true }, "ctx")).toEqual({ ok: true });
    expect(() => validateOrThrow(schema, { ok: "nope" }, "ctx")).toThrow(
      "Validation failed in ctx",
    );
    expect(() => validateOrThrow(schema, { ok: "nope" })).toThrow("Validation failed");
    expect(validateOrDefault(schema, { ok: true }, { ok: false })).toEqual({ ok: true });
    expect(validateOrDefault(schema, { ok: "nope" }, { ok: false })).toEqual({ ok: false });
    expect(isValidSchema(schema, { ok: true })).toBe(true);
    expect(isValidSchema(schema, { ok: "nope" })).toBe(false);
    expect(parseJson(schema, '{"ok":true}', "ctx")).toEqual({ ok: true });
    expect(() => parseJson(schema, "not-json", "ctx")).toThrow("Invalid JSON in ctx");
    expect(() => parseJson(schema, "not-json")).toThrow("Invalid JSON");
  });
});
