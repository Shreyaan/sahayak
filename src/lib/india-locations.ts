import { getAllStates, getDistricts } from "india-state-district";
import { z } from "zod";
import type { ReviewJurisdiction } from "./review-case";

export const indiaStates = getAllStates().toSorted((left, right) => left.name.localeCompare(right.name));

export function indiaDistricts(stateCode: string): string[] {
  return getDistricts(stateCode).toSorted((left, right) => left.localeCompare(right));
}

export const jurisdictionSuggestionSchema = z.object({
  scope: z.enum(["central", "state", "district"]),
  stateName: z.string().trim().min(1).max(80).optional(),
  districtName: z.string().trim().min(1).max(80).optional(),
  reason: z.object({ hi: z.string().trim().min(1).max(500), en: z.string().trim().min(1).max(500) }).strict(),
}).strict();

export type JurisdictionSuggestion = z.infer<typeof jurisdictionSuggestionSchema>;

export function resolveJurisdiction(suggestion: JurisdictionSuggestion): ReviewJurisdiction {
  if (suggestion.scope === "central") return { scope: "central" };

  const state = indiaStates.find((item) =>
    item.code.toLowerCase() === suggestion.stateName?.toLowerCase()
    || item.name.toLowerCase() === suggestion.stateName?.toLowerCase(),
  );
  if (!state) throw new Error("INVALID_JURISDICTION_SUGGESTION");
  if (suggestion.scope === "state") return { scope: "state", stateCode: state.code };

  const district = indiaDistricts(state.code).find((name) => name.toLowerCase() === suggestion.districtName?.toLowerCase());
  if (!district) throw new Error("INVALID_JURISDICTION_SUGGESTION");
  return { scope: "district", stateCode: state.code, districtCode: district };
}

export function jurisdictionLabel(jurisdiction: ReviewJurisdiction, locale: "hi" | "en" = "en"): string {
  const state = indiaStates.find((item) => item.code === jurisdiction.stateCode)?.name;
  return [jurisdiction.scope === "central" ? (locale === "hi" ? "केंद्र सरकार" : "Central government") : state, jurisdiction.districtCode].filter(Boolean).join(" · ");
}
