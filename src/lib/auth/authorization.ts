export type AccessLevel = "none" | "expert" | "admin";

export function accessLevelFor(input: {
  userRole?: string | null;
  memberRole?: string | null;
  emailVerified: boolean;
}): AccessLevel {
  if (!input.emailVerified || input.memberRole === "revoked" || !input.memberRole) return "none";
  if (input.userRole === "admin" && input.memberRole === "owner") return "admin";
  if (["member", "admin", "owner"].includes(input.memberRole)) return "expert";
  return "none";
}
