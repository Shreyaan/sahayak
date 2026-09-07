import { expect, test } from "bun:test";
import { buildActionBrief } from "./action-brief";
import { startCase, recordDeskReport, workflows } from "./workflow";
import type { TrustMetadata } from "./trust";

const trust = { sourceLinks: [] } as unknown as TrustMetadata;
test("the portable brief carries bilingual preparation and the actual latest response", () => {
  const snapshot = recordDeskReport(startCase("scholarship"), {
    optionId: "npci-missing", response: "Demo: desk asked for a mapping check", responseDate: "2026-09-07",
    recordedAt: "2026-09-07T09:00:00Z", referenceNumber: "DEMO-701", evidence: "Demo note kept on paper",
  }).caseSnapshot;
  const brief = buildActionBrief(snapshot, workflows.scholarship, trust, "en");
  expect(brief).toContain("My problem / मेरी समस्या");
  expect(brief).toContain("Request a bank seeding check");
  expect(brief).toContain("बैंक से सीडिंग जाँच का अनुरोध करें");
  expect(brief).toContain("Demo: desk asked for a mapping check");
  expect(brief).toContain("2026-09-07");
  expect(brief).toContain("DEMO-701");
  expect(brief).toContain("Demo note kept on paper");
  expect(brief).toContain(snapshot.workflowVersionId);
  expect(brief).toContain("not a government submission");
});
