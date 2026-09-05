import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { jurisdictionSchema, reviewRevisionContentSchema } from "./review-case";

const payloadSchema = z.object({
  submittedTitle: z.string().trim().min(1).max(120).optional(),
  input: z.string().trim().min(1).max(4_000),
  jurisdiction: jurisdictionSchema,
  draft: reviewRevisionContentSchema,
  expiresAt: z.number().int(),
}).strict();

function secret() {
  const value = process.env.CONTRIBUTION_PREVIEW_SECRET?.trim() || process.env.BETTER_AUTH_SECRET?.trim();
  if (!value) throw new Error("PREVIEW_TOKEN_UNAVAILABLE");
  return value;
}

function signature(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function signContributionPreview(input: Omit<z.infer<typeof payloadSchema>, "expiresAt">) {
  const encoded = Buffer.from(JSON.stringify(payloadSchema.parse({ ...input, expiresAt: Date.now() + 10 * 60_000 }))).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyContributionPreview(token: string) {
  const [encoded, provided, ...extra] = token.split(".");
  if (!encoded || !provided || extra.length) throw new Error("INVALID_PREVIEW_TOKEN");
  const expected = signature(encoded);
  const valid = provided.length === expected.length && timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) throw new Error("INVALID_PREVIEW_TOKEN");
  const payload = payloadSchema.safeParse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (!payload.success || payload.data.expiresAt < Date.now()) throw new Error("INVALID_PREVIEW_TOKEN");
  return payload.data;
}
