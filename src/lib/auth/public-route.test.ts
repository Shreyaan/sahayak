import { describe, expect, test } from "bun:test";
import { isAllowedPublicAuthPath } from "./public-route";

describe("public Better Auth route policy", () => {
  test("keeps sign-in and invitation acceptance available", () => {
    expect(isAllowedPublicAuthPath("/api/auth/sign-in/email")).toBe(true);
    expect(isAllowedPublicAuthPath("/api/auth/organization/accept-invitation")).toBe(true);
    expect(isAllowedPublicAuthPath("/api/auth/organization/set-active")).toBe(true);
  });

  test("blocks organization administration and directory endpoints", () => {
    expect(isAllowedPublicAuthPath("/api/auth/organization/list-members")).toBe(false);
    expect(isAllowedPublicAuthPath("/api/auth/organization/list-invitations")).toBe(false);
    expect(isAllowedPublicAuthPath("/api/auth/organization/invite-member")).toBe(false);
    expect(isAllowedPublicAuthPath("/api/auth/organization/update-member-role")).toBe(false);
    expect(isAllowedPublicAuthPath("/api/auth/organization/delete")).toBe(false);
  });
});
