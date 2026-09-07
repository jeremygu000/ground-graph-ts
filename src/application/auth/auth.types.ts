import { z } from "zod";

export const AuthContextSchema = z.object({
  tenantId: z.uuid(),
  principalId: z.uuid(),
  userId: z.uuid().optional(),
  roles: z.array(z.string()).default([]),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;
