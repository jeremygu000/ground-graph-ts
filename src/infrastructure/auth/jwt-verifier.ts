import * as jose from "jose";
import { AuthContextSchema, type AuthContext } from "../../application/auth/auth.types";

export interface JWTVerifierDeps {
  secret: string;
  issuer: string;
  audience: string;
}

export class JWTVerifier {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(deps: JWTVerifierDeps) {
    this.secret = deps.secret;
    this.issuer = deps.issuer;
    this.audience = deps.audience;
  }

  async verify(token: string): Promise<AuthContext | null> {
    try {
      const secret = new TextEncoder().encode(this.secret);
      const { payload } = await jose.jwtVerify(token, secret, {
        issuer: this.issuer,
        audience: this.audience,
      });

      const rawContext = {
        tenantId: payload.tenantId as string,
        principalId: payload.principalId as string,
        userId: payload.userId as string | undefined,
        roles: (payload.roles as string[]) ?? [],
      };

      const parsed = AuthContextSchema.safeParse(rawContext);
      if (!parsed.success) {
        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }
}

export function createJWTVerifier(): JWTVerifier | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  return new JWTVerifier({
    secret,
    issuer: process.env.JWT_ISSUER ?? "ground-graph",
    audience: process.env.JWT_AUDIENCE ?? "ground-graph-api",
  });
}
