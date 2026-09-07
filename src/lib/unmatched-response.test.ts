import { expect, test } from "bun:test";
import { startCase, recordDeskReport, currentNode, applyIntent, workflows, registerWorkflowDefinition } from "./workflow";
import { buildActionBrief } from "./action-brief";
import type { TrustMetadata } from "./trust";
const message = "Desk said the scheme is closed for this year and told me to come back in April. Nothing about payment.";
const report = { optionId: "different", response: message, responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z" };

test("an unmapped desk answer pauses guidance instead of repeating the payment chase", () => {
  const result = recordDeskReport(startCase("scholarship"), report);
  expect(result.reply.en).not.toContain("payment reference");
  expect(result.caseSnapshot.nodes.find(n => n.id === "pfms-trace")?.state).toBe("blocked");
  expect(currentNode(result.caseSnapshot)?.link).toBeUndefined();
  expect(currentNode(result.caseSnapshot)?.visit).toBeUndefined();
  expect(currentNode(result.caseSnapshot)?.title.en).toBe("Review the answer you received");
  expect(applyIntent(result.caseSnapshot, "affirmative").caseSnapshot).toEqual(result.caseSnapshot);
  const restored = JSON.parse(JSON.stringify(result.caseSnapshot));
  const brief = buildActionBrief(restored, workflows.scholarship, {sourceLinks: []} as unknown as TrustMetadata, "en");
  expect(brief).toContain(message);
  expect(brief).not.toContain("Open PFMS");
});

test("a new supported answer can resume a paused case without losing the earlier answer", () => {
  const paused = recordDeskReport(startCase("scholarship"), report).caseSnapshot;
  const resumed = recordDeskReport(paused, {...report, optionId: "npci-missing", response: "Later clarification: NPCI mapping is missing"}).caseSnapshot;
  expect(currentNode(resumed)?.id).toBe("bank-seeding");
  expect(resumed.reports).toHaveLength(2);
  expect(resumed.reports?.[0].response).toBe(message);
});

for (const definition of Object.values(workflows)) {
  for (const node of definition.nodes) {
    if (!node.report?.options.some(option => option.id === "different" && !option.outcome)) continue;
    test(`${definition.id}/${node.id}: unmapped response uses the same pause and evidence contract`, () => {
      const initial = startCase(definition.id);
      initial.nodes = initial.nodes.map(entry => ({...entry, state: entry.id === node.id ? "needs-you" : "pending"}));
      const result = recordDeskReport(initial, report);
      expect(result.reply.en).toContain("instructions are paused");
      expect(result.reply.hi).toContain("निर्देश रोक");
      expect(result.caseSnapshot.nodes.find(entry => entry.id === node.id)?.state).toBe("blocked");
      expect(currentNode(result.caseSnapshot)?.title.en).toBe("Review the answer you received");
      expect(result.caseSnapshot.artifacts).toEqual([]);
    });
  }
}

test("already saved unmapped responses also suppress obsolete guidance without rewriting their version", () => {
  const legacy = recordDeskReport(startCase("scholarship"), report).caseSnapshot;
  legacy.nodes = legacy.nodes.map(node => node.id === "pfms-trace" ? {...node, state: "needs-you"} : node);
  const version = legacy.workflowVersionId;
  expect(currentNode(legacy)?.title.en).toBe("Review the answer you received");
  expect(currentNode(legacy)?.link).toBeUndefined();
  expect(legacy.workflowVersionId).toBe(version);
});


test("a later no-outcome answer restores an actionable step and keeps every report", () => {
  const definition = structuredClone(workflows.scholarship);
  definition.id = "review-no-outcome";
  definition.nodes[0].report!.options.push({
    id: "waiting", label: {en: "Waiting", hi: "प्रतीक्षा"},
    reply: {en: "Still waiting", hi: "अभी प्रतीक्षा"},
  });
  registerWorkflowDefinition(definition);
  const paused = recordDeskReport(startCase(definition.id), report).caseSnapshot;
  const waiting = recordDeskReport(paused, {...report, optionId: "waiting"}).caseSnapshot;
  expect(currentNode(waiting)?.id).toBe("pfms-trace");
  expect(waiting.nodes[0].state).toBe("needs-you");
  const resumed = recordDeskReport(waiting, {...report, optionId: "npci-missing"}).caseSnapshot;
  expect(currentNode(resumed)?.id).toBe("bank-seeding");
  expect(resumed.reports).toHaveLength(3);
});
