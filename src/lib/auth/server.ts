import { accessLevelFor } from "./authorization";
import { REVIEW_ORG_ID } from "./config";

type SessionResult = {
  user: {
    id: string;
    emailVerified: boolean;
    role?: string | null;
    [key: string]: unknown;
  };
  session: { id: string; [key: string]: unknown };
};

type OrganizationResult = {
  members: Array<{ id: string; userId: string; role: string }>;
} | null;

export interface ServerAccessApi {
  getSession(input: { headers: Headers }): Promise<SessionResult | null>;
  getFullOrganization(input: {
    headers: Headers;
    query: { organizationId: string; membersLimit: number };
  }): Promise<OrganizationResult>;
}

export type AuthorizedAccess = {
  userId: string;
  memberId: string;
  level: "expert" | "admin";
  session: SessionResult;
};

export function createServerAccess(api: ServerAccessApi) {
  async function read(headers: Headers): Promise<AuthorizedAccess | null> {
    const session = await api.getSession({ headers });
    if (!session) return null;

    const organization = await api.getFullOrganization({
      headers,
      query: { organizationId: REVIEW_ORG_ID, membersLimit: 100 },
    });

    const member = organization?.members.find(({ userId }) => userId === session.user.id);
    const level = accessLevelFor({
      userRole: session.user.role,
      memberRole: member?.role,
      emailVerified: session.user.emailVerified,
    });

    return level === "none" || !member
      ? null
      : { userId: session.user.id, memberId: member.id, level, session };
  }

  return {
    read,
    async requireExpert(headers: Headers) {
      const session = await api.getSession({ headers });
      if (!session) throw new Error("AUTH_REQUIRED");
      const authorized = await read(headers);
      if (!authorized) throw new Error("EXPERT_REQUIRED");
      return authorized;
    },
    async requireAdmin(headers: Headers) {
      const session = await api.getSession({ headers });
      if (!session) throw new Error("AUTH_REQUIRED");
      const authorized = await read(headers);
      if (authorized?.level !== "admin") throw new Error("ADMIN_REQUIRED");
      return authorized;
    },
  };
}
