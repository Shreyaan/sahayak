import { describe, expect, test } from "bun:test";
import { accessLevelFor } from "./authorization";

describe("accessLevelFor", () => {
  test("allows a verified organization member to review", () => {
    expect(accessLevelFor({ userRole: "user", memberRole: "member", emailVerified: true })).toBe("expert");
  });

  test("denies a revoked organization member", () => {
    expect(accessLevelFor({ userRole: "user", memberRole: "revoked", emailVerified: true })).toBe("none");
  });

  test("allows only a verified global admin who owns the review organization to administer access", () => {
    expect(accessLevelFor({ userRole: "admin", memberRole: "owner", emailVerified: true })).toBe("admin");
    expect(accessLevelFor({ userRole: "admin", memberRole: "member", emailVerified: true })).toBe("expert");
    expect(accessLevelFor({ userRole: "admin", memberRole: "owner", emailVerified: false })).toBe("none");
  });
});
