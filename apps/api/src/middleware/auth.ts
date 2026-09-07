import { z } from "zod";
import { createJWTVerifier } from "@/infrastructure/auth/jwt-verifier";
import type { AuthContext } from "@/application/auth/auth.types";

const jwtVerifier = createJWTVerifier();

export { AuthContextSchema } from "@/application/auth/auth.types";
export type { AuthContext } from "@/application/auth/auth.types";

export const AuthHeaderSchema = z.object({
  authorization: z.string().regex(/^Bearer /),
});

export async function extractAuthContext(
  headers: Record<string, string | string[] | undefined>,
): Promise<AuthContext | null> {
  const authHeader = Array.isArray(headers.authorization)
    ? headers.authorization[0]
    : headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  if (!jwtVerifier) {
    return null;
  }

  return jwtVerifier.verify(token);
}
