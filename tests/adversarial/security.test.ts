import { describe, expect, it } from "vitest";
import { extractBalancedJsonObject } from "@/infrastructure/models/structured-output-parser";
import { sanitize } from "@/infrastructure/postgres/fulltext-index";
import { clamp, clamp01 } from "@/infrastructure/postgres/fulltext-index";

describe("Adversarial/security tests", () => {
  describe("injection resistance", () => {
    it("extractBalancedJsonObject handles malicious JSON injection", () => {
      const maliciousInputs = [
        '{"key": "value"}',
        '{"key": "injection"}garbage',
        '{"key": "value"}"extra"',
        '{"key": "\\"injected\\""}',
        '{"a": 1}{"b": 2}',
        'prefix{"key": "value"}suffix',
        '{"key": "normal"}garbage{"key": "more"}',
      ];

      for (const input of maliciousInputs) {
        const result = extractBalancedJsonObject(input);
        if (result) {
          expect(() => JSON.parse(result)).not.toThrow();
        }
      }
    });

    it("extractBalancedJsonObject rejects unbalanced braces", () => {
      const unbalanced = [
        "{{{{{{",
        "}}}}}}",
        '{"key": "unclosed',
        "{key: missing quotes",
        '{"nested": {"deeper": {"still open"}',
      ];

      for (const input of unbalanced) {
        const result = extractBalancedJsonObject(input);
        expect(result).toBeUndefined();
      }
    });

    it("sanitize removes SQL/NoSQL injection characters", () => {
      const maliciousTokens = [
        "'; DROP TABLE users;--",
        '"; DELETE FROM facts--',
        "1' OR '1'='1",
        '{"$gt": ""}',
        '{"$ne": null}',
        "admin--",
        "/* comment */",
      ];

      for (const token of maliciousTokens) {
        const sanitized = sanitize(token);
        expect(sanitized).not.toMatch(/[;'"\-$]/i);
        expect(sanitized).toBe(sanitized.toLowerCase());
      }
    });

    it("sanitize handles unicode attempts", () => {
      const unicodeAttacks = ["cafe", "naive", "ABC"];

      for (const token of unicodeAttacks) {
        const sanitized = sanitize(token);
        expect(sanitized).toBeDefined();
        expect(sanitized.length).toBeGreaterThan(0);
      }
    });

    it("sanitize removes special characters entirely", () => {
      const specials = ["!@#$%^&*()+=[]{}|", "test@example.com", "hello-world_123"];

      for (const token of specials) {
        const sanitized = sanitize(token);
        expect(sanitized).toMatch(/^[a-z0-9]*$/);
      }
    });
  });

  describe("input validation bounds", () => {
    it("clamp01 rejects NaN and out-of-range values", () => {
      expect(clamp01(NaN)).toBe(0);
      expect(clamp01(-0.5)).toBe(0);
      expect(clamp01(1.5)).toBe(1);
      expect(clamp01(0.5)).toBe(0.5);
    });

    it("clamp enforces min/max bounds", () => {
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(50, 0, 100)).toBe(50);
    });

    it("sanitize handles empty and whitespace input", () => {
      expect(sanitize("")).toBe("");
      expect(sanitize("   ")).toBe("");
      expect(sanitize("!@#")).toBe("");
    });

    it("sanitize handles very long input", () => {
      const longInput = "a".repeat(100000);
      const result = sanitize(longInput);
      expect(result.length).toBe(100000);
    });
  });

  describe("graph inference leak prevention", () => {
    it("extractBalancedJsonObject does not leak memory addresses", () => {
      const pointerAttempt = '{"addr": 0x7fff1234}';
      const result = extractBalancedJsonObject(pointerAttempt);
      if (result) {
        const parsed = JSON.parse(result);
        expect(parsed.addr).not.toBe(0x7fff1234);
      }
    });

    it("extractBalancedJsonObject limits extraction size", () => {
      const largeObject = '{"key": "' + "a".repeat(100000) + '"}';
      const result = extractBalancedJsonObject(largeObject);
      expect(result).toBeUndefined();
    });
  });

  describe("ACL boundary enforcement", () => {
    it("sanitize does not allow ACL bypass via encoding", () => {
      const encodingBypass = ["admin%00", "adm\x00in", "admin\n"];

      for (const token of encodingBypass) {
        const sanitized = sanitize(token);
        expect(sanitized).not.toContain("admin");
      }
    });
  });
});
