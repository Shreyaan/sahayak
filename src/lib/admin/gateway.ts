import { auth } from "@/lib/auth";
import { appBaseUrl, REVIEW_ORG_NAME } from "@/lib/auth/config";
import { authEmail } from "@/lib/auth/email-instance";
import { serverAccess } from "@/lib/auth/server-instance";
import { createBetterAuthAccessGateway } from "./better-auth-access";

export const adminAccessGateway = createBetterAuthAccessGateway({
  requireAdmin: (headers) => serverAccess.requireAdmin(headers),
  sendInvitation: ({ email, invitationId }) => authEmail.sendInvitation({
    email,
    invitationId,
    organizationName: REVIEW_ORG_NAME,
    baseUrl: appBaseUrl(),
  }),
  api: {
    listInvitations: (input) => auth.api.listInvitations(input),
    listMembers: (input) => auth.api.listMembers(input),
    inviteMember: (input) => auth.api.createInvitation(input),
    cancelInvitation: (input) => auth.api.cancelInvitation(input),
    updateMemberRole: (input) => auth.api.updateMemberRole(input),
  },
});
