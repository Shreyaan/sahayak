import { createHash } from "node:crypto";
import { z } from "zod";
import { workflowDefinitionSchema } from "./workflow";

export const localizedSchema = z.object({
  hi: z.string().trim().min(1).max(2_000),
  en: z.string().trim().min(1).max(2_000),
}).strict();

export const jurisdictionSchema = z.object({
  scope: z.enum(["central", "state", "district"]),
  stateCode: z.string().trim().min(1).max(32).optional(),
  districtCode: z.string().trim().min(1).max(32).optional(),
}).strict().superRefine((value, context) => {
  if (value.scope !== "central" && !value.stateCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stateCode"], message: "A state code is required." });
  }
  if (value.scope === "district" && !value.districtCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["districtCode"], message: "A district code is required." });
  }
  if (value.scope === "central" && (value.stateCode || value.districtCode)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Central jurisdiction cannot include location codes." });
  }
  if (value.scope === "state" && value.districtCode) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["districtCode"], message: "State jurisdiction cannot include a district code." });
  }
});

const conflictSchema = z.object({
  field: localizedSchema,
  submitted: localizedSchema,
  bundled: localizedSchema,
  reason: localizedSchema,
}).strict();

const wordingOnlyRevisionSchema = z.object({
  title: localizedSchema,
  summary: localizedSchema,
  steps: z.array(localizedSchema).min(1).max(20),
  matches: z.array(localizedSchema).max(20),
  additions: z.array(localizedSchema).max(20),
  conflicts: z.array(conflictSchema).max(10),
  sourceType: z.literal("lived experience"),
}).strict();

/** Exact pre-0009 persisted shape, retained only to identify unavailable legacy rows. */
export const legacyWordingOnlyRevisionSchema = wordingOnlyRevisionSchema;

export const reviewRevisionContentSchema = wordingOnlyRevisionSchema.extend({
  /** Stable workflow identity; revisions alter wording, never the workflow or graph. */
  workflowId: z.string().trim().min(1).max(128),
  /** The shared engine definition, retained in full for later publication. */
  definition: workflowDefinitionSchema,
}).strict().superRefine((value, context) => {
  if (value.workflowId !== value.definition.id) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["workflowId"], message: "Workflow identity must match the definition." });
  }
});

export type ReviewRevisionContent = z.infer<typeof reviewRevisionContentSchema>;
export type ReviewJurisdiction = z.infer<typeof jurisdictionSchema>;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hash only validated revision content so identical drafts keep one identity. */
export function revisionHash(content: ReviewRevisionContent): string {
  return createHash("sha256").update(canonical(reviewRevisionContentSchema.parse(content))).digest("hex");
}
