import { describe, expect, mock, test } from "bun:test";
import { createAdminAccessHandlers, type AdminAccessGateway } from "./access-handlers";

function gateway(overrides: Partial<AdminAccessGateway> = {}): AdminAccessGateway {
  return {
    requireAdmin: async () => ({ userId: "admin-1" }),
    listAccess: async () => ({ invitations: [], members: [] }),
    inviteExpert: async () => ({ id: "invite-1", email: "expert@example.com", status: "pending" }),
    cancelInvitation: async () => undefined,
    setExpertAccess: async () => undefined,
    ...overrides,
  };
}

describe("admin access handlers", () => {
  test("rejects an unauthenticated access list with a stable error", async () => {
    const handlers = createAdminAccessHandlers(gateway({
      requireAdmin: async () => {
        throw new Error("AUTH_REQUIRED");
      },
    }));

    const response = await handlers.list(new Request("http://localhost/api/admin/access"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED", message: "Please sign in." } });
  });

  test("validates an expert invitation before calling Better Auth", async () => {
    const inviteExpert = mock(async () => ({ id: "ignored", email: "ignored@example.com", status: "pending" }));
    const handlers = createAdminAccessHandlers(gateway({ inviteExpert }));
    const response = await handlers.invite(new Request("http://localhost/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST", message: "Enter a valid email address." } });
    expect(inviteExpert).not.toHaveBeenCalled();
  });

  test("normalizes the invited expert email", async () => {
    const inviteExpert = mock(async ({ email }: { email: string }) => ({ id: "invite-1", email, status: "pending" }));
    const handlers = createAdminAccessHandlers(gateway({ inviteExpert }));
    const response = await handlers.invite(new Request("http://localhost/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: " Expert@Example.COM " }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ invitation: { id: "invite-1", email: "expert@example.com", status: "pending" } });
  });

  test("does not report invitation success when email delivery is unavailable", async () => {
    const handlers = createAdminAccessHandlers(gateway({
      inviteExpert: async () => {
        throw new Error("EMAIL_UNAVAILABLE");
      },
    }));
    const response = await handlers.invite(new Request("http://localhost/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "expert@example.com" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "EMAIL_UNAVAILABLE", message: "Email delivery is not configured." },
    });
  });

  test("accepts only remove or restore access actions", async () => {
    const setExpertAccess = mock(async () => undefined);
    const handlers = createAdminAccessHandlers(gateway({ setExpertAccess }));
    const response = await handlers.updateMember(
      new Request("http://localhost/api/admin/members/member-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
      "member-1",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_REQUEST", message: "Choose remove or restore." } });
    expect(setExpertAccess).not.toHaveBeenCalled();
  });

  test("rejects an oversized member ID before reaching Better Auth", async () => {
    const setExpertAccess = mock(async () => undefined);
    const handlers = createAdminAccessHandlers(gateway({ setExpertAccess }));
    const response = await handlers.updateMember(
      new Request("http://localhost/api/admin/members/invalid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove" }),
      }),
      "x".repeat(201),
    );

    expect(response.status).toBe(400);
    expect(setExpertAccess).not.toHaveBeenCalled();
  });
});
