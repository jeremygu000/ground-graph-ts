import { describe, it, expect } from "vitest";
import {
  JSON_VALUE_SCHEMA,
  isJSONValue,
  assertJSONValue,
  JSON_OBJECT_SCHEMA,
  isJSONObject,
} from "../../../src/domain/json";

describe("JSON", () => {
  describe("JSON_VALUE_SCHEMA", () => {
    it("should validate string", () => {
      expect(JSON_VALUE_SCHEMA.safeParse("hello").success).toBe(true);
    });

    it("should validate number", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(42).success).toBe(true);
      expect(JSON_VALUE_SCHEMA.safeParse(3.14).success).toBe(true);
    });

    it("should validate boolean", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(true).success).toBe(true);
      expect(JSON_VALUE_SCHEMA.safeParse(false).success).toBe(true);
    });

    it("should validate null", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(null).success).toBe(true);
    });

    it("should validate array", () => {
      expect(JSON_VALUE_SCHEMA.safeParse([1, "two", true]).success).toBe(true);
    });

    it("should validate object", () => {
      expect(JSON_VALUE_SCHEMA.safeParse({ key: "value" }).success).toBe(true);
    });

    it("should reject undefined", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(undefined).success).toBe(false);
    });

    it("should reject NaN", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(NaN).success).toBe(false);
    });

    it("should reject Infinity", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(Infinity).success).toBe(false);
    });

    it("should reject function", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(() => {}).success).toBe(false);
    });

    it("should reject Date", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(new Date()).success).toBe(false);
    });

    it("should reject Map", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(new Map()).success).toBe(false);
    });

    it("should reject Set", () => {
      expect(JSON_VALUE_SCHEMA.safeParse(new Set()).success).toBe(false);
    });
  });

  describe("isJSONValue", () => {
    it("should return true for valid JSON values", () => {
      expect(isJSONValue("hello")).toBe(true);
      expect(isJSONValue(42)).toBe(true);
      expect(isJSONValue({ key: "value" })).toBe(true);
      expect(isJSONValue([1, 2, 3])).toBe(true);
    });

    it("should return false for invalid values", () => {
      expect(isJSONValue(undefined)).toBe(false);
      expect(isJSONValue(NaN)).toBe(false);
      expect(isJSONValue(() => {})).toBe(false);
    });
  });

  describe("assertJSONValue", () => {
    it("should not throw for valid values", () => {
      expect(() => assertJSONValue("hello")).not.toThrow();
      expect(() => assertJSONValue({ key: "value" })).not.toThrow();
    });

    it("should throw for invalid values", () => {
      expect(() => assertJSONValue(undefined)).toThrow("Invalid JSON value");
      expect(() => assertJSONValue(NaN)).toThrow("Invalid JSON value");
    });
  });

  describe("JSON_OBJECT_SCHEMA", () => {
    it("should validate objects", () => {
      expect(JSON_OBJECT_SCHEMA.safeParse({}).success).toBe(true);
      expect(JSON_OBJECT_SCHEMA.safeParse({ key: "value" }).success).toBe(true);
      expect(JSON_OBJECT_SCHEMA.safeParse({ nested: { deep: true } }).success).toBe(true);
    });

    it("should reject arrays", () => {
      expect(JSON_OBJECT_SCHEMA.safeParse([]).success).toBe(false);
      expect(JSON_OBJECT_SCHEMA.safeParse([1, 2]).success).toBe(false);
    });
  });

  describe("isJSONObject", () => {
    it("should return true for objects", () => {
      expect(isJSONObject({})).toBe(true);
      expect(isJSONObject({ key: "value" })).toBe(true);
    });

    it("should return false for non-objects", () => {
      expect(isJSONObject([])).toBe(false);
      expect(isJSONObject("string")).toBe(false);
    });
  });
});
