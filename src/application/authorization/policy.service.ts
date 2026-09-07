import type { AuthContext } from "../auth.types";
import type { Permission, PolicyDecisionPoint, AccessDecision } from "./policy.types";

export class SimplePolicyService implements PolicyDecisionPoint {
  async evaluate(
    subject: AuthContext,
    action: Permission,
    resource: string,
  ): Promise<AccessDecision> {
    if (subject.roles.includes("admin") || subject.roles.includes("admin:access")) {
      return { allowed: true, reason: "Admin role grants access" };
    }

    const requiredPermissions: Record<string, Permission[]> = {
      "documents:read": ["documents:read", "documents:write", "admin:access"],
      "documents:write": ["documents:write", "admin:access"],
      "entities:read": ["entities:read", "entities:write", "admin:access"],
      "entities:write": ["entities:write", "admin:access"],
      "facts:read": ["facts:read", "facts:write", "admin:access"],
      "facts:write": ["facts:write", "admin:access"],
      "query:execute": ["query:execute", "admin:access"],
    };

    const allowedPermissions = requiredPermissions[action] ?? [action];

    const hasPermission = subject.roles.some((role) => allowedPermissions.includes(role as Permission));
    if (!hasPermission) {
      return {
        allowed: false,
        reason: `No matching role found for action ${action}`,
      };
    }

    const resourceTenantId = this.extractTenantId(resource);
    if (resourceTenantId && resourceTenantId !== subject.tenantId) {
      return {
        allowed: false,
        reason: "Resource belongs to different tenant",
      };
    }

    return { allowed: true, reason: "Permission granted" };
  }

  private extractTenantId(resource: string): string | undefined {
    const match = resource.match(/tenants\/([a-f0-9-]+)/i);
    return match ? match[1] : undefined;
  }
}
