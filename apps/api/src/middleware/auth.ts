import { z } from "zod";

export const AuthContextSchema = z.object({
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  roles: z.array(z.string()).default([]),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;

export const AuthHeaderSchema = z.object({
  authorization: z.string().regex(/^Bearer /),
});

export function extractAuthContext(
  headers: Record<string, string | string[] | undefined>,
): AuthContext | null {
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

  try {
    const payload = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
    return AuthContextSchema.parse(payload);
  } catch {
    return null;
  }
}
