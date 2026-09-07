import { describe, expect, it, vi } from "vitest";
import { SimplePolicyService } from "@/application/authorization/policy.service";
import type { AuthContext } from "@/application/auth.types";

describe("SimplePolicyService", () => {
  const service = new SimplePolicyService();

  const createAuthContext = (overrides: Partial<AuthContext> = {}): AuthContext => ({
    tenantId: "123e4567-e89b-12d3-a456-426614174000",
    principalId: "123e4567-e89b-12d3-a456-426614174001",
    userId: "123e4567-e89b-12d3-a456-426614174002",
    roles: [],
    ...overrides,
  });

  describe("admin role access", () => {
    it("allows access for admin role", async () => {
      const subject = createAuthContext({ roles: ["admin"] });
      const result = await service.evaluate(subject, "documents:read", "tenants/123/documents/456");
      expect(result.allowed).toBe(true);
    });

    it("allows access for admin:access role", async () => {
      const subject = createAuthContext({ roles: ["admin:access"] });
      const result = await service.evaluate(subject, "query:execute", "tenants/123/query");
      expect(result.allowed).toBe(true);
    });
  });

  describe("tenant isolation", () => {
    it("denies access to resources in different tenant", async () => {
      const subject = createAuthContext({
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
        roles: ["documents:read"],
      });
      const result = await service.evaluate(
        subject,
        "documents:read",
        "tenants/999e4567-e89b-12d3-a456-426614174999/documents/456",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("different tenant");
    });

    it("allows access to resources in same tenant", async () => {
      const subject = createAuthContext({
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
        roles: ["documents:read"],
      });
      const result = await service.evaluate(
        subject,
        "documents:read",
        "tenants/123e4567-e89b-12d3-a456-426614174000/documents/456",
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("permission mapping", () => {
    it("maps documents:read permission correctly", async () => {
      const subject = createAuthContext({
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
        roles: ["documents:read"],
      });
      const result = await service.evaluate(
        subject,
        "documents:read",
        "tenants/123e4567-e89b-12d3-a456-426614174000/documents/456",
      );
      expect(result.allowed).toBe(true);
    });

    it("denies without required permission", async () => {
      const subject = createAuthContext({
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
        roles: ["query:execute"],
      });
      const result = await service.evaluate(
        subject,
        "documents:write",
        "tenants/123e4567-e89b-12d3-a456-426614174000/documents/456",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("No matching role found");
    });
  });

  describe("resource without tenant", () => {
    it("allows access to resources without tenant in path", async () => {
      const subject = createAuthContext({ roles: ["query:execute"] });
      const result = await service.evaluate(subject, "query:execute", "query");
      expect(result.allowed).toBe(true);
    });
  });
});
