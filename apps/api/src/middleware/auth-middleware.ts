import type { FastifyRequest, FastifyReply } from "fastify";
import { extractAuthContext, AuthContextSchema } from "./auth";
import { createProblemDetail, UNAUTHORIZED_ERROR_TYPE } from "../schemas/problem-detail.schema";

export interface AuthMiddlewareDeps {
  skipPaths?: string[];
}

export function createAuthMiddleware(deps: AuthMiddlewareDeps = {}) {
  const skipPaths = new Set(deps.skipPaths ?? ["/healthz", "/ready", "/docs", "/swagger"]);

  return async function authMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const path = request.url.split("?")[0] ?? "";
    if (skipPaths.has(path)) {
      return;
    }

    const authContext = await extractAuthContext(
      request.headers as Record<string, string | string[] | undefined>,
    );

    if (!authContext) {
      reply
        .status(401)
        .send(
          createProblemDetail(
            UNAUTHORIZED_ERROR_TYPE,
            "Unauthorized",
            401,
            "Missing or invalid Authorization header",
          ),
        );
      return;
    }

    const parsed = AuthContextSchema.safeParse(authContext);
    if (!parsed.success) {
      reply
        .status(401)
        .send(
          createProblemDetail(UNAUTHORIZED_ERROR_TYPE, "Unauthorized", 401, "Invalid auth context"),
        );
      return;
    }

    request.authContext = {
      tenantId: parsed.data.tenantId,
      principalId: parsed.data.principalId,
      userId: parsed.data.userId,
      roles: parsed.data.roles,
    };
  };
}

declare module "fastify" {
  interface FastifyRequest {
    authContext?: {
      tenantId: string;
      principalId: string;
      userId?: string | undefined;
      roles: string[];
    };
  }
}
