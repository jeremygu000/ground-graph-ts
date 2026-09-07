import { z } from "zod";

export const AuthContextSchema = z.object({
  tenantId: z.string().uuid(),
  principalId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  roles: z.array(z.string()).default([]),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;
