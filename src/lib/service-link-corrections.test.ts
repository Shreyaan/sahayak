import { expect, test } from "bun:test";
import { correctServiceLink } from "./service-link-corrections";
import { workflows, startCase, currentNode, recordDeskReport } from "./workflow";
import { buildActionBrief } from "./action-brief";
import type { TrustMetadata } from "./trust";

test("old scholarship versions get current PFMS instructions without mutation", () => {
  const definition = workflows.scholarship;
  const before = JSON.stringify(definition);
  const snapshot = startCase("scholarship", "scholarship-v6");
  const step = currentNode(snapshot)!;
  expect(step.link?.url).toBe("https://pfms.nic.in/SitePages/KnowYourPayment_Dw_NewNew.aspx");
  expect(step.detail.en).toStartWith("Check your payment status on PFMS.");
  expect(step.detail.en).not.toContain("older DBT");
  expect(step.detail.en).not.toContain("Link checked");
  expect(step.detail.en).not.toContain("Choose NSP");
  expect(step.detail.hi).toContain("केवल आधिकारिक वेबसाइट");
  const brief = buildActionBrief(snapshot, definition, {sourceLinks: []} as unknown as TrustMetadata, "en");
  expect(brief).toContain("KnowYourPayment_Dw_NewNew.aspx");
  expect(brief).not.toContain("DBT_StatusTracker.aspx");
  expect(JSON.stringify(definition)).toBe(before);
  expect(snapshot.workflowVersionId).toBe("scholarship-v6");
  expect(correctServiceLink(step)).toEqual(step);
});

test("an unmatched response still suppresses the corrected link", () => {
  const paused = recordDeskReport(startCase("scholarship"), {optionId: "different", response: "Synthetic: scheme closed", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  expect(currentNode(paused)?.link).toBeUndefined();
});
