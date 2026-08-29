import { describe, expect, test } from "bun:test";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  sharedStepTypes,
  startCase,
  workflowIds,
  workflows,
  type CaseSnapshot,
} from "./workflow";

function stateOf(caseSnapshot: CaseSnapshot, nodeId: string) {
  return caseSnapshot.nodes.find((node) => node.id === nodeId)?.state;
}

/** Walks a case forward until the named node is the current action. */
function confirmUntil(caseSnapshot: CaseSnapshot, nodeId: string): CaseSnapshot {
  let snapshot = caseSnapshot;

  for (let guard = 0; guard < 40 && currentNode(snapshot)?.id !== nodeId; guard += 1) {
    snapshot = currentNode(snapshot)
      ? applyCitizenReply(snapshot, "हाँ").caseSnapshot
      : advanceDay(snapshot).caseSnapshot;
  }

  return snapshot;
}

describe("workflow seeds", () => {
  test("both journeys are powered by one engine and share step types", () => {
    expect(workflowIds).toEqual(["bereavement", "scholarship"]);
    expect(sharedStepTypes()).toEqual(
      expect.arrayContaining(["document-explain", "desk-verification", "case-complete"]),
    );
  });

  test.each(workflowIds)("every %s outcome points at a real node", (workflowId) => {
    const workflow = workflows[workflowId];
    const ids = new Set(workflow.nodes.map((node) => node.id));

    expect(ids.has(workflow.firstNodeId)).toBe(true);
    for (const node of workflow.nodes) {
      for (const outcome of [node.onConfirm, node.onDecline, node.verify?.outcome]) {
        if (outcome?.opens) expect(ids.has(outcome.opens)).toBe(true);
      }
    }
  });

  test("a fresh case opens exactly one action", () => {
    const caseSnapshot = startCase("bereavement");

    expect(caseSnapshot.nodes.filter((node) => node.state === "needs-you")).toHaveLength(1);
    expect(currentNode(caseSnapshot)?.id).toBe("form4-explain");
    expect(caseSnapshot.artifacts).toEqual([]);
  });
});

describe("applyCitizenReply", () => {
  test("an unclear reply repeats the question and changes nothing", () => {
    const caseSnapshot = startCase("bereavement");
    const result = applyCitizenReply(caseSnapshot, "मुझे समझ नहीं आय");

    expect(result.caseSnapshot).toEqual(caseSnapshot);
    expect(result.reply).toBe(currentNode(caseSnapshot)!.ask);
  });

  test("a negative reply never advances a confirmation-only node", () => {
    const caseSnapshot = confirmUntil(startCase("bereavement"), "form4-explain");
    const result = applyCitizenReply(caseSnapshot, "नहीं, अभी नहीं");

    expect(result.caseSnapshot).toEqual(caseSnapshot);
    expect(stateOf(result.caseSnapshot, "name-check")).toBe("pending");
  });

  test("declining the name check opens the correction path instead of the bank claim", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const { caseSnapshot, reply } = applyCitizenReply(atNameCheck, "नहीं, नाम गलत है");

    expect(stateOf(caseSnapshot, "name-check")).toBe("blocked");
    expect(stateOf(caseSnapshot, "name-correction")).toBe("needs-you");
    expect(stateOf(caseSnapshot, "bank-claim")).toBe("pending");
    expect(reply).toContain("सुधार");
  });

  test("confirming the correction records the declaration artifact once", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const declined = applyCitizenReply(atNameCheck, "नहीं").caseSnapshot;
    const corrected = applyCitizenReply(declined, "हाँ").caseSnapshot;

    expect(corrected.artifacts).toEqual(["correction-declaration"]);
    expect(stateOf(corrected, "bank-claim")).toBe("needs-you");
  });
});

describe("advanceDay", () => {
  test("holds a desk verification until its own clock expires", () => {
    const submitted = applyCitizenReply(
      confirmUntil(startCase("bereavement"), "bank-claim"),
      "हाँ",
    ).caseSnapshot;

    expect(stateOf(submitted, "bank-claim")).toBe("verifying");

    const afterOneDay = advanceDay(submitted).caseSnapshot;
    expect(stateOf(afterOneDay, "bank-claim")).toBe("verifying");

    const afterTwoDays = advanceDay(afterOneDay).caseSnapshot;
    expect(stateOf(afterTwoDays, "bank-claim")).toBe("blocked");
    expect(stateOf(afterTwoDays, "bank-claim-fix")).toBe("needs-you");
  });

  test("each SLA clock runs from when its own verification started", () => {
    const atEpfo = confirmUntil(startCase("bereavement"), "epfo-claim");
    const submitted = applyCitizenReply(atEpfo, "हाँ").caseSnapshot;

    expect(submitted.day).toBeGreaterThanOrEqual(2);
    expect(advanceDay(submitted).caseSnapshot.nodes.find((n) => n.id === "epfo-claim")?.state)
      .toBe("verifying");

    const breached = advanceDay(advanceDay(advanceDay(submitted).caseSnapshot).caseSnapshot)
      .caseSnapshot;
    expect(stateOf(breached, "epfo-claim")).toBe("blocked");
    expect(stateOf(breached, "rti-draft")).toBe("needs-you");
  });

  test("the same journey always produces the same rejection and breach", () => {
    const runOnce = () => confirmUntil(startCase("bereavement"), "rti-draft");

    expect(runOnce()).toEqual(runOnce());
  });
});

describe("complete journeys", () => {
  test("bereavement reaches completion with every demanded proof point", () => {
    const finished = confirmUntil(startCase("bereavement"), "case-done");
    const done = applyCitizenReply(finished, "हाँ").caseSnapshot;

    // The correction branch stays untaken here: this walk confirms the name.
    expect(stateOf(done, "name-correction")).toBe("pending");
    expect(done.nodes.some((node) => node.state === "needs-you" || node.state === "verifying"))
      .toBe(false);
    expect(stateOf(done, "case-done")).toBe("done");
    expect(done.artifacts).toEqual(["bank-letter", "rti-draft"]);
    expect(applyCitizenReply(done, "हाँ").reply).toContain("Case Card");
  });

  test("scholarship reuses the same engine through its bounce and breach", () => {
    const finished = confirmUntil(startCase("scholarship"), "case-done");

    expect(stateOf(finished, "pfms-trace")).toBe("blocked");
    expect(stateOf(finished, "verify-again")).toBe("blocked");
    expect(finished.artifacts).toEqual(["npci-checklist", "escalation-draft"]);
  });
});
