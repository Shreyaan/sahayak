import { afterEach, describe, expect, mock, test } from "bun:test";
import { createAuthEmailSender } from "./email";
import { appBaseUrl } from "./config";

afterEach(() => mock.restore());

describe("auth email delivery", () => {
  test("fails safely without a Resend API key", async () => {
    const sender = createAuthEmailSender({ apiKey: undefined, from: "Sahayak <access@example.com>" });

    expect(await sender.sendInvitation({
      email: "expert@example.com",
      invitationId: "invite-1",
      organizationName: "Sahayak Review Network",
      baseUrl: "https://sahayak.example",
    })).toEqual({ delivered: false, reason: "EMAIL_UNAVAILABLE" });
  });

  test("uses the exact invitation acceptance URL", async () => {
    const send = mock(async () => ({ data: { id: "mail-1" }, error: null }));
    const sender = createAuthEmailSender({
      apiKey: "test-key",
      from: "Sahayak <access@example.com>",
      send,
    });

    const result = await sender.sendInvitation({
      email: "expert@example.com",
      invitationId: "invite-1",
      organizationName: "Sahayak Review Network",
      baseUrl: "https://sahayak.example/",
    });

    expect(result).toEqual({ delivered: true });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      to: "expert@example.com",
      html: expect.stringContaining("https://sahayak.example/invite/invite-1"),
    }));
  });

  test("returns a stable failure when Resend rejects delivery", async () => {
    const sender = createAuthEmailSender({
      apiKey: "test-key",
      from: "Sahayak <access@example.com>",
      send: async () => ({ data: null, error: { message: "provider detail" } }),
    });

    expect(await sender.sendVerification({
      email: "expert@example.com",
      verificationUrl: "https://sahayak.example/verify/token",
    })).toEqual({ delivered: false, reason: "EMAIL_DELIVERY_FAILED" });
  });
});

describe("auth URL configuration", () => {
  test("does not generate localhost links in production", () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAuthUrl = process.env.BETTER_AUTH_URL;
    const previousPublicUrl = process.env.NEXT_PUBLIC_APP_URL;
    env.NODE_ENV = "production";
    delete process.env.BETTER_AUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;

    try {
      expect(() => appBaseUrl()).toThrow("APP_URL_REQUIRED");
    } finally {
      env.NODE_ENV = previousNodeEnv;
      if (previousAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
      else process.env.BETTER_AUTH_URL = previousAuthUrl;
      if (previousPublicUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previousPublicUrl;
    }
  });
});
