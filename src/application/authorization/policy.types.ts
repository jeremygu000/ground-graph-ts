import { z } from "zod";
import type { AuthContext } from "../auth.types";

export const PermissionSchema = z.enum([
  "documents:read",
  "documents:write",
  "entities:read",
  "entities:write",
  "facts:read",
  "facts:write",
  "query:execute",
  "admin:access",
]);

export type Permission = z.infer<typeof PermissionSchema>;

export const RoleSchema = z.object({
  name: z.string(),
  permissions: z.array(PermissionSchema),
});

export type Role = z.infer<typeof RoleSchema>;

export const PolicySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  effect: z.enum(["allow", "deny"]),
  principals: z.array(z.string()),
  resources: z.array(z.string()),
  actions: z.array(PermissionSchema),
  conditions: z.record(z.string(), z.unknown()).optional(),
});

export type Policy = z.infer<typeof PolicySchema>;

export interface AccessDecision {
  allowed: boolean;
  reason?: string;
  policyId?: string;
}

export interface PolicyDecisionPoint {
  evaluate(subject: AuthContext, action: Permission, resource: string): Promise<AccessDecision>;
}

export interface PolicyRepository {
  findById(id: string): Promise<Policy | null>;
  listByResource(resource: string): Promise<Policy[]>;
}
