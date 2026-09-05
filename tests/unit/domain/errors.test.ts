import { describe, it, expect } from "vitest";
import {
  AppError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from "../../../src/domain/errors";

describe("Domain Errors", () => {
  describe("AppError", () => {
    it("should create an error with code and message", () => {
      const error = new AppError({
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      });

      expect(error.code).toBe("INTERNAL_ERROR");
      expect(error.message).toBe("Something went wrong");
      expect(error.name).toBe("AppError");
    });

    it("should include cause and metadata", () => {
      const cause = new Error("Original error");
      const error = new AppError({
        code: "DATABASE_ERROR",
        message: "Database connection failed",
        cause,
        metadata: { connectionId: "123" },
      });

      expect(error.cause).toBe(cause);
      expect(error.metadata).toEqual({ connectionId: "123" });
    });

    it("should serialize to JSON correctly", () => {
      const error = new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        metadata: { field: "email" },
      });

      const json = error.toJSON();

      expect(json.name).toBe("AppError");
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.message).toBe("Invalid input");
      expect(json.metadata).toEqual({ field: "email" });
    });
  });

  describe("ValidationError", () => {
    it("should have correct code", () => {
      const error = new ValidationError("Field is required");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.name).toBe("ValidationError");
    });
  });

  describe("NotFoundError", () => {
    it("should format message with resource and id", () => {
      const error = new NotFoundError("Document", "123");
      expect(error.message).toBe("Document with id '123' not found");
    });

    it("should format message without id", () => {
      const error = new NotFoundError("Document");
      expect(error.message).toBe("Document not found");
    });
  });

  describe("DatabaseError", () => {
    it("should include cause", () => {
      const cause = new Error("Connection refused");
      const error = new DatabaseError("Failed to connect", cause);
      expect(error.code).toBe("DATABASE_ERROR");
      expect(error.cause).toBe(cause);
    });
  });
});
