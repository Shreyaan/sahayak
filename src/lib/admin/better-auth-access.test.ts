import { describe, expect, test } from "bun:test";
import { REVIEW_ORG_ID } from "@/lib/auth/config";
import { createBetterAuthAccessGateway } from "./better-auth-access";

describe("Better Auth admin access gateway", () => {
  test("lists only pending invitations and organization members", async () => {
    const gateway = createBetterAuthAccessGateway({
      requireAdmin: async () => ({ userId: "admin-1" }),
      api: {
        listInvitations: async () => [
          { id: "pending-1", email: "new@example.com", role: "member", status: "pending", expiresAt: new Date(), createdAt: new Date(), organizationId: REVIEW_ORG_ID, inviterId: "admin-1" },
          { id: "cancelled-1", email: "old@example.com", role: "member", status: "canceled", expiresAt: new Date(), createdAt: new Date(), organizationId: REVIEW_ORG_ID, inviterId: "admin-1" },
        ],
        listMembers: async () => ({
          members: [{ id: "member-1", organizationId: REVIEW_ORG_ID, userId: "user-1", role: "member", createdAt: new Date(), user: { id: "user-1", name: "Meera", email: "meera@example.com", image: null } }],
          total: 1,
        }),
        inviteMember: async () => { throw new Error("unused"); },
        cancelInvitation: async () => { throw new Error("unused"); },
        updateMemberRole: async () => { throw new Error("unused"); },
      },
    });

    const result = await gateway.listAccess(new Headers());

    expect(result.invitations.map(({ id }) => id)).toEqual(["pending-1"]);
    expect(result.members.map(({ id }) => id)).toEqual(["member-1"]);
  });

  test("removes and restores access by changing only the Better Auth member role", async () => {
    const updates: unknown[] = [];
    const expert = { id: "member-1", organizationId: REVIEW_ORG_ID, userId: "user-1", role: "member", createdAt: new Date(), user: { id: "user-1", name: "Meera", email: "meera@example.com" } };
    const gateway = createBetterAuthAccessGateway({
      requireAdmin: async () => ({ userId: "admin-1" }),
      api: {
        listInvitations: async () => [],
        listMembers: async () => ({ members: [expert], total: 1 }),
        inviteMember: async () => { throw new Error("unused"); },
        cancelInvitation: async () => { throw new Error("unused"); },
        updateMemberRole: async (input) => { updates.push(input); return {} as never; },
      },
    });

    await gateway.setExpertAccess({ memberId: "member-1", active: false, headers: new Headers() });
    await gateway.setExpertAccess({ memberId: "member-1", active: true, headers: new Headers() });

    expect(updates).toEqual([
      { body: { memberId: "member-1", organizationId: REVIEW_ORG_ID, role: "revoked" }, headers: expect.any(Headers) },
      { body: { memberId: "member-1", organizationId: REVIEW_ORG_ID, role: "member" }, headers: expect.any(Headers) },
    ]);
  });

  test("cancels a new invitation and reports failure when its email was not delivered", async () => {
    const cancelled: string[] = [];
    const gateway = createBetterAuthAccessGateway({
      requireAdmin: async () => ({ userId: "admin-1" }),
      sendInvitation: async () => ({ delivered: false, reason: "EMAIL_UNAVAILABLE" }),
      api: {
        listInvitations: async () => [],
        listMembers: async () => ({ members: [], total: 0 }),
        inviteMember: async ({ body }) => ({
          id: "invite-1", email: body.email, role: body.role, status: "pending",
          expiresAt: new Date(), createdAt: new Date(), organizationId: body.organizationId, inviterId: "admin-1",
        }),
        cancelInvitation: async ({ body }) => { cancelled.push(body.invitationId); },
        updateMemberRole: async () => { throw new Error("unused"); },
      },
    });

    await expect(gateway.inviteExpert({ email: "expert@example.com", headers: new Headers() }))
      .rejects.toThrow("EMAIL_UNAVAILABLE");
    expect(cancelled).toEqual(["invite-1"]);
  });

  test("never changes administrator ownership through the expert access endpoint", async () => {
    let updated = false;
    const gateway = createBetterAuthAccessGateway({
      requireAdmin: async () => ({ userId: "admin-1" }),
      api: {
        listInvitations: async () => [],
        listMembers: async () => ({
          members: [{ id: "owner-1", organizationId: REVIEW_ORG_ID, userId: "admin-1", role: "owner", createdAt: new Date(), user: { id: "admin-1", name: "Admin", email: "admin@example.com" } }],
          total: 1,
        }),
        inviteMember: async () => { throw new Error("unused"); },
        cancelInvitation: async () => { throw new Error("unused"); },
        updateMemberRole: async () => { updated = true; return {} as never; },
      },
    });

    await expect(gateway.setExpertAccess({ memberId: "owner-1", active: false, headers: new Headers() }))
      .rejects.toThrow("MEMBER_NOT_MANAGEABLE");
    expect(updated).toBe(false);
  });
});
