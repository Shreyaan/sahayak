import { expect, test } from "bun:test";
import { buildActionBrief } from "./action-brief";
import { startCase, recordDeskReport, workflows } from "./workflow";
import type { TrustMetadata } from "./trust";

const trust = { sourceLinks: [] } as unknown as TrustMetadata;
test("the portable brief uses the UI language for preparation and the actual latest response", () => {
  const snapshot = recordDeskReport(startCase("scholarship"), {
    optionId: "npci-missing", response: "Demo: desk asked for a mapping check", responseDate: "2026-09-07",
    recordedAt: "2026-09-07T09:00:00Z", referenceNumber: "DEMO-701", evidence: "Demo note kept on paper",
  }).caseSnapshot;
  const brief = buildActionBrief(snapshot, workflows.scholarship, trust, "en");
  expect(brief).toContain("My problem");
  expect(brief).toContain("Request a bank seeding check");
  expect(brief).not.toContain("बैंक से सीडिंग जाँच का अनुरोध करें");
  expect(brief).toContain("Demo: desk asked for a mapping check");
  expect(brief).toContain("2026-09-07");
  expect(brief).toContain("DEMO-701");
  expect(brief).toContain("Demo note kept on paper");
  expect(brief).not.toContain(snapshot.workflowVersionId);
  const hindi = buildActionBrief(snapshot, workflows.scholarship, trust, "hi");
  expect(hindi).toContain("बैंक से सीडिंग जाँच का अनुरोध करें");
  expect(hindi).not.toContain("Request a bank seeding check");
  expect(hindi).not.toContain("Workflow version");
  expect(hindi).not.toContain("यात्रा संस्करण");
  expect(hindi).toContain("Demo: desk asked for a mapping check");

});

test("a kept clarification stays separate from actual desk evidence in the brief", () => {
  const snapshot = startCase("scholarship");
  snapshot.clarificationNotes = [{text: "Does April apply to my existing payment?", reportRecordedAt: "2026-09-08T10:00:00Z", savedAt: "2026-09-08T10:05:00Z"}];
  const brief = buildActionBrief(snapshot, workflows.scholarship, trust, "en");
  expect(brief).toContain("Questions you kept — not official guidance");
  expect(brief).toContain("Does April apply");
  expect(brief).not.toContain("Last response you recorded");
});
