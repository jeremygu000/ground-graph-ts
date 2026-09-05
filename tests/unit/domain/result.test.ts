import { describe, it, expect } from "vitest";
import {
  success,
  failure,
  isSuccess,
  isFailure,
  unwrap,
  unwrapOr,
  map,
  mapError,
} from "../../../src/domain/result";

describe("Result", () => {
  describe("success", () => {
    it("should create a success result", () => {
      const result = success(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });
  });

  describe("failure", () => {
    it("should create a failure result", () => {
      const error = new Error("Something went wrong");
      const result = failure(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe("isSuccess", () => {
    it("should return true for success result", () => {
      expect(isSuccess(success(42))).toBe(true);
    });

    it("should return false for failure result", () => {
      expect(isSuccess(failure(new Error()))).toBe(false);
    });
  });

  describe("isFailure", () => {
    it("should return false for success result", () => {
      expect(isFailure(success(42))).toBe(false);
    });

    it("should return true for failure result", () => {
      expect(isFailure(failure(new Error()))).toBe(true);
    });
  });

  describe("unwrap", () => {
    it("should return value for success", () => {
      expect(unwrap(success(42))).toBe(42);
    });

    it("should throw for failure", () => {
      const error = new Error("Test");
      expect(() => unwrap(failure(error))).toThrow(error);
    });
  });

  describe("unwrapOr", () => {
    it("should return value for success", () => {
      expect(unwrapOr(success(42), 0)).toBe(42);
    });

    it("should return default for failure", () => {
      expect(unwrapOr(failure(new Error()), 0)).toBe(0);
    });
  });

  describe("map", () => {
    it("should transform success value", () => {
      const result = map(success(42), (n) => n * 2);
      expect(result).toEqual(success(84));
    });

    it("should pass through failure", () => {
      const error = new Error("Test");
      const result = map(failure(error), (n: number) => n * 2);
      expect(result).toEqual(failure(error));
    });
  });

  describe("mapError", () => {
    it("should pass through success", () => {
      const result = mapError(success(42), (_e) => new Error("Transformed"));
      expect(result).toEqual(success(42));
    });

    it("should transform error", () => {
      const original = new Error("Original");
      const result = mapError(failure(original), (e) => new Error(`Transformed: ${e.message}`));
      expect((result as any).error.message).toBe("Transformed: Original");
    });
  });
});
