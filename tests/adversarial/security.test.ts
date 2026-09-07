import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

const AUTH_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const AUTH_PRINCIPAL_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000002";

const authMiddlewareModule = await import("../../apps/api/src/middleware/auth-middleware");
const documentsRoutesModule = await import("../../apps/api/src/routes/documents");
const jwtVerifierModule = await import("../../src/infrastructure/auth/jwt-verifier");

function createReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("Adversarial production security boundaries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("JWT verification", () => {
    it("rejects claims with invalid UUIDs", async () => {
      const verifier = new jwtVerifierModule.JWTVerifier({
        secret: "test-secret",
        issuer: "ground-graph",
        audience: "ground-graph-api",
      });

      const token = await new SignJWT({
        tenantId: "not-a-uuid",
        principalId: "still-not-a-uuid",
        roles: ["tester"],
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer("ground-graph")
        .setAudience("ground-graph-api")
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("test-secret"));

      await expect(verifier.verify(token)).resolves.toBeNull();
    });

    it("accepts valid JWT auth context", async () => {
      const verifier = new jwtVerifierModule.JWTVerifier({
        secret: "test-secret",
        issuer: "ground-graph",
        audience: "ground-graph-api",
      });

      const token = await new SignJWT({
        tenantId: AUTH_TENANT_ID,
        principalId: AUTH_PRINCIPAL_ID,
        roles: ["tester"],
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setIssuer("ground-graph")
        .setAudience("ground-graph-api")
        .setExpirationTime("1h")
        .sign(new TextEncoder().encode("test-secret"));

      await expect(verifier.verify(token)).resolves.toMatchObject({
        tenantId: AUTH_TENANT_ID,
        principalId: AUTH_PRINCIPAL_ID,
      });
    });
  });

  describe("Auth middleware", () => {
    it("rejects requests without a Bearer token", async () => {
      const middleware = authMiddlewareModule.createAuthMiddleware();
      const reply = createReply();

      await middleware({ headers: {} as never, url: "/v1/query" } as never, reply as never);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          title: "Unauthorized",
        }),
      );
    });

    it("permits skipped health routes without auth", async () => {
      const middleware = authMiddlewareModule.createAuthMiddleware();
      const reply = createReply();

      await middleware({ headers: {}, url: "/healthz" } as never, reply as never);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });
  });

  describe("Route ACL enforcement", () => {
    it("rejects cross-tenant document access with 403", async () => {
      let listDocumentsHandler:
        | ((request: unknown, reply: unknown) => unknown | Promise<unknown>)
        | undefined;
      const app = {
        get: vi.fn((path: string, options: { handler: typeof listDocumentsHandler }) => {
          if (path === "/v1/documents") {
            listDocumentsHandler = options.handler;
          }
        }),
      } as never;

      await documentsRoutesModule.registerDocumentsRoutes(app, {
        uowFactory: {
          create: vi.fn(),
        },
      } as never);

      const reply = createReply();
      const request = {
        authContext: { tenantId: AUTH_TENANT_ID, principalId: AUTH_PRINCIPAL_ID, roles: [] },
        query: { tenantId: OTHER_TENANT_ID, limit: 20, offset: 0 },
        log: { error: vi.fn() },
      };

      expect(listDocumentsHandler).toBeTypeOf("function");
      await listDocumentsHandler!(request as never, reply as never);

      expect(reply.status).toHaveBeenCalledWith(403);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          title: "Forbidden",
        }),
      );
    });
  });
});
