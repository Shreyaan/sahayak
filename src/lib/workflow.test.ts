import { describe, expect, test } from "bun:test";
import { artifactContent } from "./artifacts";
import { locales, t } from "./locale";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  isClearedBlocker,
  nodeNote,
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

/**
 * Every path in `value` where a localized string is missing a language. An
 * object carrying any locale key is treated as a localized string, so a value
 * that was translated into Hindi but not English is reported rather than
 * silently walked past.
 */
function missingTranslations(value: unknown, path: string): string[] {
  if (value === null || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => missingTranslations(entry, `${path}[${index}]`));
  }

  const record = value as Record<string, unknown>;

  if (locales.some((locale) => locale in record)) {
    return locales
      .filter((locale) => {
        const text = record[locale];
        return typeof text !== "string" || text.trim() === "";
      })
      .map((locale) => `${path}.${locale}`);
  }

  return Object.entries(record).flatMap(([key, entry]) =>
    missingTranslations(entry, `${path}.${key}`),
  );
}

describe("every user-facing string is bilingual", () => {
  test("both workflow seeds carry Hindi and English everywhere", () => {
    expect(missingTranslations(workflows, "workflows")).toEqual([]);
  });

  test("every artifact carries Hindi and English everywhere", () => {
    expect(missingTranslations(artifactContent, "artifactContent")).toEqual([]);
  });

  test("the checker catches a translation that was left out", () => {
    const broken = { title: { hi: "शीर्षक", en: "" }, body: [{ hi: "पंक्ति" }] };

    expect(missingTranslations(broken, "broken")).toEqual(["broken.title.en", "broken.body[0].en"]);
  });

  test.each(workflowIds)("%s engine replies are bilingual through the journey", (workflowId) => {
    let snapshot = startCase(workflowId);

    for (let guard = 0; guard < 40; guard += 1) {
      const result = currentNode(snapshot)
        ? applyCitizenReply(snapshot, "हाँ")
        : advanceDay(snapshot);

      expect(missingTranslations(result.reply, "reply")).toEqual([]);
      snapshot = result.caseSnapshot;
    }

    // The idle replies, produced once no node is open, are localized too.
    expect(missingTranslations(applyCitizenReply(snapshot, "हाँ").reply, "reply")).toEqual([]);
  });
});

describe("workflow seeds", () => {
  test("both journeys are powered by one engine and share step types", () => {
    expect(workflowIds).toEqual(["bereavement", "scholarship"]);
    expect(sharedStepTypes()).toEqual(
      expect.arrayContaining(["document-explain", "desk-verification", "case-complete"]),
    );
  });

  test("the two name spellings the demo turns on stay distinct", () => {
    const nameCheck = workflows.bereavement.nodes.find((node) => node.id === "name-check")!;

    expect(t(nameCheck.detail, "hi")).toContain("Shyam Sunder");
    expect(t(nameCheck.detail, "hi")).toContain("Shyam Sundar");
    expect(t(nameCheck.detail, "en")).toContain("Shyam Sunder");
    expect(t(nameCheck.detail, "en")).toContain("Shyam Sundar");
  });

  test("the RTI draft never claims the 48-hour provision applies", () => {
    const rti = workflows.bereavement.nodes.find((node) => node.id === "rti-draft")!;

    expect(t(rti.detail, "en")).toContain("48-hour");
    expect(t(rti.detail, "en")).toContain("does not apply");
    expect(t(artifactContent["rti-draft"].body[3], "en")).toContain("does not apply");
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
    expect(result.reply).toEqual(currentNode(caseSnapshot)!.ask);
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
    expect(t(reply, "hi")).toContain("सुधार");
    expect(t(reply, "en")).toContain("correction");
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
    expect(t(applyCitizenReply(done, "हाँ").reply, "hi")).toContain("Case Card");
    expect(t(applyCitizenReply(done, "हाँ").reply, "en")).toContain("Case Card");
  });

  test("scholarship reuses the same engine through its bounce and breach", () => {
    const finished = confirmUntil(startCase("scholarship"), "case-done");

    // Both were blocked in flight — the NPCI bounce and the SLA breach — and both
    // were closed by their recovery step, which the Case Card reports as cleared.
    expect(isClearedBlocker(finished, "pfms-trace")).toBe(true);
    expect(isClearedBlocker(finished, "verify-again")).toBe(true);
    expect(t(nodeNote(finished, "pfms-trace")!, "hi")).toContain("NPCI");
    expect(t(nodeNote(finished, "pfms-trace")!, "en")).toContain("NPCI");
    expect(t(nodeNote(finished, "verify-again")!, "hi")).toContain("समय-सीमा");
    expect(t(nodeNote(finished, "verify-again")!, "en")).toContain("Time limit");
    expect(finished.artifacts).toEqual(["npci-checklist", "escalation-draft"]);
  });
});

describe("recovery closes what it recovered from", () => {
  test("a rejected bank claim is closed once its fix is confirmed, keeping the reason", () => {
    const submitted = applyCitizenReply(
      confirmUntil(startCase("bereavement"), "bank-claim"),
      "हाँ",
    ).caseSnapshot;
    const rejected = advanceDay(advanceDay(submitted).caseSnapshot).caseSnapshot;

    expect(stateOf(rejected, "bank-claim")).toBe("blocked");
    expect(t(nodeNote(rejected, "bank-claim")!, "hi")).toContain("अस्वीकृति");
    expect(t(nodeNote(rejected, "bank-claim")!, "en")).toContain("Rejection");
    expect(isClearedBlocker(rejected, "bank-claim")).toBe(false);

    const recovered = applyCitizenReply(rejected, "हाँ").caseSnapshot;

    expect(stateOf(recovered, "bank-claim")).toBe("done");
    expect(isClearedBlocker(recovered, "bank-claim")).toBe(true);
    expect(t(nodeNote(recovered, "bank-claim")!, "hi")).toContain("अस्वीकृति");
    expect(t(nodeNote(recovered, "bank-claim")!, "en")).toContain("Rejection");
  });

  test("a declined name check is closed once the correction is added", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const declined = applyCitizenReply(atNameCheck, "नहीं").caseSnapshot;
    const corrected = applyCitizenReply(declined, "हाँ").caseSnapshot;

    expect(stateOf(declined, "name-check")).toBe("blocked");
    expect(stateOf(corrected, "name-check")).toBe("done");
    expect(isClearedBlocker(corrected, "name-check")).toBe(true);
  });

  test("a node that was never blocked carries no note", () => {
    const confirmed = confirmUntil(startCase("bereavement"), "bank-claim");

    expect(stateOf(confirmed, "name-check")).toBe("done");
    expect(nodeNote(confirmed, "name-check")).toBeUndefined();
    expect(isClearedBlocker(confirmed, "name-check")).toBe(false);
  });

  test.each(["bereavement", "scholarship"] as const)(
    "a finished %s case leaves nothing blocked",
    (workflowId) => {
      const finished = applyCitizenReply(
        confirmUntil(startCase(workflowId), "case-done"),
        "हाँ",
      ).caseSnapshot;

      expect(finished.nodes.filter((node) => node.state === "blocked")).toHaveLength(0);
      expect(finished.nodes.some((node) => isClearedBlocker(finished, node.id))).toBe(true);
    },
  );
});
