import { describe, it, expect } from "vitest";
import {
  createTenantId,
  createUserId,
  createSourceId,
  createDocumentId,
  createChunkId,
  createEntityId,
  createFactId,
  createEvidenceId,
  createRunId,
  createStepId,
  ISO_8601_REGEX,
  isValidIS08601DateString,
  createUTCDateString,
} from "../../../src/domain/primitives";

describe("Primitives", () => {
  describe("ID creation functions", () => {
    it("should create tenant ID", () => {
      const id = createTenantId("test-tenant");
      expect(id).toBe("test-tenant");
    });

    it("should throw for empty ID", () => {
      expect(() => createTenantId("")).toThrow("TenantId cannot be empty");
    });

    it("should create user ID", () => {
      const id = createUserId("user-123");
      expect(id).toBe("user-123");
    });

    it("should create source ID", () => {
      const id = createSourceId("src-456");
      expect(id).toBe("src-456");
    });

    it("should create document ID", () => {
      const id = createDocumentId("doc-789");
      expect(id).toBe("doc-789");
    });

    it("should create chunk ID", () => {
      const id = createChunkId("chk-abc");
      expect(id).toBe("chk-abc");
    });

    it("should create entity ID", () => {
      const id = createEntityId("ent-xyz");
      expect(id).toBe("ent-xyz");
    });

    it("should create fact ID", () => {
      const id = createFactId("fct-123");
      expect(id).toBe("fct-123");
    });

    it("should create evidence ID", () => {
      const id = createEvidenceId("evd-456");
      expect(id).toBe("evd-456");
    });

    it("should create run ID", () => {
      const id = createRunId("run-789");
      expect(id).toBe("run-789");
    });

    it("should create step ID", () => {
      const id = createStepId("stp-abc");
      expect(id).toBe("stp-abc");
    });
  });

  describe("ISO 8601 date validation", () => {
    it("should match valid ISO 8601 strings", () => {
      expect(ISO_8601_REGEX.test("2024-01-15T10:30:00Z")).toBe(true);
      expect(ISO_8601_REGEX.test("2024-01-15T10:30:00.123Z")).toBe(true);
      expect(ISO_8601_REGEX.test("2024-12-31T23:59:59Z")).toBe(true);
    });

    it("should reject invalid date strings", () => {
      expect(ISO_8601_REGEX.test("not-a-date")).toBe(false);
      expect(ISO_8601_REGEX.test("2024-13-01T00:00:00Z")).toBe(false);
      expect(ISO_8601_REGEX.test("2024-01-01T25:00:00Z")).toBe(false);
    });

    it("should validate correct ISO 8601 strings", () => {
      expect(isValidIS08601DateString("2024-01-15T10:30:00Z")).toBe(true);
      expect(isValidIS08601DateString("2024-01-15T10:30:00.123Z")).toBe(true);
    });

    it("should reject invalid ISO 8601 strings", () => {
      expect(isValidIS08601DateString("invalid")).toBe(false);
      expect(isValidIS08601DateString("2024-13-45T00:00:00Z")).toBe(false);
    });
  });

  describe("createUTCDateString", () => {
    it("should create a valid ISO 8601 UTC string", () => {
      const result = createUTCDateString();
      expect(isValidIS08601DateString(result)).toBe(true);
      expect(result.endsWith("Z")).toBe(true);
    });

    it("should create string from specific date", () => {
      const date = new Date("2024-01-15T10:30:00Z");
      const result = createUTCDateString(date);
      expect(result).toBe("2024-01-15T10:30:00.000Z");
    });
  });
});
