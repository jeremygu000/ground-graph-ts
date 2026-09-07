import { z } from "zod";
import { createJWTVerifier } from "@/infrastructure/auth/jwt-verifier";
import { AuthContextSchema } from "@/application/auth/auth.types";
import type { AuthContext } from "@/application/auth/auth.types";

const jwtVerifier = createJWTVerifier();

export { AuthContextSchema } from "@/application/auth/auth.types";
export type { AuthContext } from "@/application/auth/auth.types";

export const AuthHeaderSchema = z.object({
  authorization: z.string().regex(/^Bearer /),
});

function decodeLegacyToken(token: string): AuthContext | null {
  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    return AuthContextSchema.parse(payload);
  } catch {
    return null;
  }
}

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

  if (jwtVerifier) {
    return jwtVerifier.verify(token);
  }

  return decodeLegacyToken(token);
}
