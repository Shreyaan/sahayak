import { Resend } from "resend";

type SendInput = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

type SendResult = Promise<{ data: { id: string } | null; error: unknown | null }>;

type DeliveryResult =
  | { delivered: true }
  | { delivered: false; reason: "EMAIL_UNAVAILABLE" | "EMAIL_DELIVERY_FAILED" };

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] ?? character);
}

function invitationUrl(baseUrl: string, invitationId: string) {
  return `${baseUrl.replace(/\/$/, "")}/invite/${encodeURIComponent(invitationId)}`;
}

export function createAuthEmailSender(options: {
  apiKey?: string;
  from: string;
  send?: (input: SendInput) => SendResult;
}) {
  const send = options.send ?? (options.apiKey
    ? (input: SendInput) => new Resend(options.apiKey).emails.send(input)
    : undefined);

  async function deliver(input: SendInput): Promise<DeliveryResult> {
    if (!send) return { delivered: false, reason: "EMAIL_UNAVAILABLE" };

    try {
      const result = await send(input);
      return result.error
        ? { delivered: false, reason: "EMAIL_DELIVERY_FAILED" }
        : { delivered: true };
    } catch {
      return { delivered: false, reason: "EMAIL_DELIVERY_FAILED" };
    }
  }

  return {
    sendInvitation(input: {
      email: string;
      invitationId: string;
      organizationName: string;
      baseUrl: string;
    }) {
      const url = invitationUrl(input.baseUrl, input.invitationId);
      return deliver({
        from: options.from,
        to: input.email,
        subject: `Join ${input.organizationName} on Sahayak`,
        html: `<p>You have been invited to review community workflows for ${escapeHtml(input.organizationName)}.</p><p><a href="${escapeHtml(url)}">Accept invitation</a></p>`,
      });
    },

    sendVerification(input: { email: string; verificationUrl: string }) {
      return deliver({
        from: options.from,
        to: input.email,
        subject: "Verify your Sahayak email",
        html: `<p>Verify your email to enter the protected review workspace.</p><p><a href="${escapeHtml(input.verificationUrl)}">Verify email</a></p>`,
      });
    },
  };
}
