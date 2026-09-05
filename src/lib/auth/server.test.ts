import { describe, expect, test } from "bun:test";
import { createServerAccess } from "./server";

const verifiedUser = {
  id: "user-1",
  name: "Expert",
  email: "expert@example.com",
  emailVerified: true,
  role: "user",
};

describe("server access guards", () => {
  test("requires a session before organization access", async () => {
    const access = createServerAccess({
      getSession: async () => null,
      getFullOrganization: async () => null,
    });

    await expect(access.requireExpert(new Headers())).rejects.toThrow("AUTH_REQUIRED");
  });

  test("rejects a session without active expert membership", async () => {
    const access = createServerAccess({
      getSession: async () => ({ user: verifiedUser, session: { id: "session-1" } }),
      getFullOrganization: async () => ({ members: [] }),
    });

    await expect(access.requireExpert(new Headers())).rejects.toThrow("EXPERT_REQUIRED");
  });

  test("returns the authorized admin identity", async () => {
    const access = createServerAccess({
      getSession: async () => ({
        user: { ...verifiedUser, role: "admin" },
        session: { id: "session-1" },
      }),
      getFullOrganization: async () => ({
        members: [{ id: "member-1", userId: "user-1", role: "owner" }],
      }),
    });

    await expect(access.requireAdmin(new Headers())).resolves.toMatchObject({
      userId: "user-1",
      memberId: "member-1",
      level: "admin",
    });
  });
});
