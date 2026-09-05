import { z } from "zod";
import { isSafePublicUrl } from "./public-url";

export const provenanceSchema = z.enum(["official-source-reviewed", "legacy-verification-pending"]);

export const trustMetadataSchema = z.object({
  provenance: provenanceSchema,
  reviewDate: z.iso.date().nullable(),
  verificationMethod: z.string().trim().min(1).max(280),
  currentExpertSupportCount: z.number().int().min(0),
  hasUnresolvedDisagreement: z.boolean(),
  sourceLinks: z.array(z.object({
    label: z.string().trim().min(1).max(160),
    url: z.string().trim().max(2_048).refine(isSafePublicUrl, "Source links must use a public https:// URL."),
  }).strict()).max(12),
}).strict().superRefine((trust, ctx) => {
  if (trust.provenance === "official-source-reviewed" && !trust.reviewDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["reviewDate"], message: "Reviewed guidance needs a review date." });
  }
});

export type TrustMetadata = z.infer<typeof trustMetadataSchema>;
export type WorkflowJurisdiction = { scope: "central" | "state" | "district"; stateCode?: string | null; districtCode?: string | null };

export function formatJurisdiction(jurisdiction: WorkflowJurisdiction, locale: "en" | "hi"): string {
  const scope = locale === "hi"
    ? { central: "केंद्रीय", state: "राज्य", district: "जिला" }[jurisdiction.scope]
    : { central: "Central", state: "State", district: "District" }[jurisdiction.scope];
  return [scope, jurisdiction.stateCode, jurisdiction.districtCode].filter(Boolean).join(" · ");
}

export function formatReviewDate(reviewDate: string | null, locale: "en" | "hi"): string {
  if (!reviewDate) return locale === "hi" ? "अभी समीक्षा नहीं हुई" : "Not yet reviewed";
  return new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${reviewDate}T00:00:00.000Z`));
}

export function parseTrustMetadata(value: unknown): TrustMetadata {
  const parsed = trustMetadataSchema.safeParse(value);
  if (!parsed.success) throw new Error("WORKFLOW_TRUST_INVALID");
  return parsed.data;
}
