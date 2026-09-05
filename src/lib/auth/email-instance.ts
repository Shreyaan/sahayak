import { createAuthEmailSender } from "./email";

export const authEmail = createAuthEmailSender({
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.AUTH_EMAIL_FROM?.trim() || "Sahayak <access@sahayak.example>",
});
