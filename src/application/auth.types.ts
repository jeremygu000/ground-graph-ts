export const AuthContextSchema = {
  tenantId: "",
  principalId: "",
  userId: undefined as string | undefined,
  roles: [] as string[],
};

export interface AuthContext {
  tenantId: string;
  principalId: string;
  userId?: string;
  roles: string[];
}
