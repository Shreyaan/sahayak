import { describe, expect, test } from "bun:test";
import { startCase } from "./workflow";
import { createCitizenOutcomeService, redactCitizenText, summarizeCitizenOutcomes } from "./citizen-outcomes";

const started = startCase("scholarship", "scholarship-v1");
const caseRecord = {
  id: "case-1",
  workflowId: "scholarship",
  snapshot: {
    ...started,
    nodes: started.nodes.map((node, index) => index === 0 ? { ...node, state: "done" as const } : node),
  },
  updatedAt: "2026-09-04T10:00:00.000Z",
};

describe("citizen outcome evidence", () => {
  test("starts a case and its awareness event through one repository operation", async () => {
    const writes: unknown[] = [];
    const service = createCitizenOutcomeService({
      getCase: async () => null,
      getWorkflowVersion: async () => ({ scope: "central", stateCode: null, districtCode: null }),
      appendOutcome: async () => undefined,
      listOutcomes: async () => [],
      summarizeOutcomes: async () => ({ awareCases: 0, resolvedCases: 0, evidencedResolvedCases: 0 }),
      createCaseWithOutcome: async (record, event) => { writes.push({ record, event }); },
    }, () => new Date("2026-09-04T12:34:56.000Z"));

    const event = await service.start("case-1", started, "owner-hash");

    expect(event.kind).toBe("awareness");
    expect(writes).toEqual([expect.objectContaining({
      record: { id: "case-1", snapshot: started, ownerHash: "owner-hash" },
      event: expect.objectContaining({ workflowVersionId: "scholarship-v1", kind: "awareness" }),
    })]);
  });

  test("redacts common Indian identity and bank-account formats before storage", () => {
    expect(redactCitizenText(
      "PAN ABCDE1234F, Aadhaar १२३४ ५६७८ ९०१२, account 1234 5678 9012 3456, फोन ९८७६५४३२१०",
    )).toBe("PAN [pan], Aadhaar [id], account [account], फोन [phone]");
  });

  test("binds redacted step feedback to the exact version, jurisdiction, and server time", async () => {
    const saved: unknown[] = [];
    const service = createCitizenOutcomeService({
      getCase: async () => caseRecord,
      getWorkflowVersion: async () => ({ scope: "central", stateCode: null, districtCode: null }),
      createCaseWithOutcome: async () => undefined,
      appendOutcome: async (event) => { saved.push(event); },
      listOutcomes: async () => [],
      summarizeOutcomes: async () => ({ awareCases: 0, resolvedCases: 0, evidencedResolvedCases: 0 }),
    }, () => new Date("2026-09-04T12:34:56.000Z"));

    const event = await service.record("case-1", {
      kind: "different",
      stepId: started.nodes[0].id,
      detail: "Call me at 9876543210 or meera@example.com; the bank asked for another form.",
    });

    expect(event).toMatchObject({
      caseId: "case-1",
      workflowVersionId: "scholarship-v1",
      stepId: started.nodes[0].id,
      kind: "different",
      scope: "central",
      stateCode: null,
      districtCode: null,
      occurredAt: "2026-09-04T12:34:56.000Z",
      detail: "Call me at [phone] or [email]; the bank asked for another form.",
    });
    expect(saved).toHaveLength(1);
  });

  test("rejects feedback for a pending or unknown step", async () => {
    const service = createCitizenOutcomeService({
      getCase: async () => caseRecord,
      getWorkflowVersion: async () => ({ scope: "central", stateCode: null, districtCode: null }),
      createCaseWithOutcome: async () => undefined,
      appendOutcome: async () => undefined,
      listOutcomes: async () => [],
      summarizeOutcomes: async () => ({ awareCases: 0, resolvedCases: 0, evidencedResolvedCases: 0 }),
    });

    await expect(service.record("case-1", { kind: "worked", stepId: started.nodes[1].id }))
      .rejects.toThrow("STEP_NOT_REPORTABLE");
    await expect(service.record("case-1", { kind: "worked", stepId: started.nodes[0].id }))
      .resolves.toMatchObject({ kind: "worked" });
    await expect(service.record("case-1", { kind: "stuck", stepId: "made-up" }))
      .rejects.toThrow("STEP_NOT_REPORTABLE");
  });

  test("keeps awareness and evidenced resolution as separate success metrics", () => {
    expect(summarizeCitizenOutcomes([
      { caseId: "case-1", kind: "awareness" },
      { caseId: "case-1", kind: "worked" },
      { caseId: "case-2", kind: "awareness" },
      { caseId: "case-2", kind: "resolved", detail: "PFMS reference 44" },
    ])).toEqual({ awareCases: 2, resolvedCases: 1, evidencedResolvedCases: 1 });
  });

  test("reads real awareness and resolution metrics through the service", async () => {
    const expected = { awareCases: 7, resolvedCases: 3, evidencedResolvedCases: 2 };
    const service = createCitizenOutcomeService({
      getCase: async () => null,
      getWorkflowVersion: async () => null,
      createCaseWithOutcome: async () => undefined,
      appendOutcome: async () => undefined,
      listOutcomes: async () => [],
      summarizeOutcomes: async () => expected,
    });

    expect(await service.metrics()).toEqual(expected);
  });
});
