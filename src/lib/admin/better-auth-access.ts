import { REVIEW_ORG_ID } from "@/lib/auth/config";
import type { AdminAccessGateway } from "./access-handlers";

type Invitation = {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  organizationId: string;
  inviterId: string;
};

type Member = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  user: { id: string; name: string; email: string; image?: string | null };
};

export interface BetterAuthOrganizationApi {
  listInvitations(input: { query: { organizationId: string }; headers: Headers }): Promise<Invitation[]>;
  listMembers(input: { query: { organizationId: string; limit: number }; headers: Headers }): Promise<{ members: Member[]; total: number }>;
  inviteMember(input: { body: { email: string; role: "member"; organizationId: string }; headers: Headers }): Promise<Invitation>;
  cancelInvitation(input: { body: { invitationId: string }; headers: Headers }): Promise<unknown>;
  updateMemberRole(input: { body: { memberId: string; organizationId: string; role: "member" | "revoked" }; headers: Headers }): Promise<unknown>;
}

type InvitationDelivery =
  | { delivered: true }
  | { delivered: false; reason: "EMAIL_UNAVAILABLE" | "EMAIL_DELIVERY_FAILED" };

export function createBetterAuthAccessGateway(input: {
  api: BetterAuthOrganizationApi;
  requireAdmin(headers: Headers): Promise<{ userId: string }>;
  sendInvitation?: (input: { email: string; invitationId: string }) => Promise<InvitationDelivery>;
}): AdminAccessGateway {
  return {
    requireAdmin: input.requireAdmin,

    async listAccess(headers) {
      const [invitations, members] = await Promise.all([
        input.api.listInvitations({ query: { organizationId: REVIEW_ORG_ID }, headers }),
        input.api.listMembers({ query: { organizationId: REVIEW_ORG_ID, limit: 100 }, headers }),
      ]);

      return {
        invitations: invitations
          .filter(({ status }) => status === "pending")
          .map(({ id, email, status, expiresAt }) => ({ id, email, status, expiresAt })),
        members: members.members.map(({ id, role, createdAt, user }) => ({ id, role, createdAt, user })),
      };
    },

    async inviteExpert({ email, headers }) {
      const invitation = await input.api.inviteMember({
        body: { email, role: "member", organizationId: REVIEW_ORG_ID },
        headers,
      });

      const cancelUndeliveredInvitation = async () => {
        try {
          await input.api.cancelInvitation({ body: { invitationId: invitation.id }, headers });
        } catch {
          // The delivery result remains the truthful public failure. The opaque
          // invitation id was not delivered and acceptance still requires the
          // matching verified email.
        }
      };

      let delivery: InvitationDelivery | undefined;
      try {
        delivery = await input.sendInvitation?.({ email: invitation.email, invitationId: invitation.id });
      } catch (error) {
        await cancelUndeliveredInvitation();
        throw error;
      }
      if (delivery && !delivery.delivered) {
        await cancelUndeliveredInvitation();
        throw new Error(delivery.reason);
      }
      return { id: invitation.id, email: invitation.email, status: invitation.status };
    },

    async cancelInvitation({ invitationId, headers }) {
      await input.api.cancelInvitation({ body: { invitationId }, headers });
    },

    async setExpertAccess({ memberId, active, headers }) {
      const members = await input.api.listMembers({
        query: { organizationId: REVIEW_ORG_ID, limit: 100 },
        headers,
      });
      const member = members.members.find(({ id }) => id === memberId);
      if (!member || !["member", "revoked"].includes(member.role)) {
        throw new Error("MEMBER_NOT_MANAGEABLE");
      }
      await input.api.updateMemberRole({
        body: { memberId, organizationId: REVIEW_ORG_ID, role: active ? "member" : "revoked" },
        headers,
      });
    },
  };
}
