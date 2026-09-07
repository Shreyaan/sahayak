import { describe, expect, test } from "bun:test";
import { artifactContent, renderArtifactBody } from "./artifacts";
import { locales, t } from "./locale";
import {
  advanceDay,
  applyIntent,
  recordDeskReport,
  currentNode,
  isClearedBlocker,
  nodeNote,
  registerWorkflowDefinition,
  sharedStepTypes,
  startCase,
  workflowIds,
  workflowDefinitionSchema,
  workflows,
  type CaseSnapshot,
  type WorkflowDefinition,
} from "./workflow";

function stateOf(caseSnapshot: CaseSnapshot, nodeId: string) {
  return caseSnapshot.nodes.find((node) => node.id === nodeId)?.state;
}

test("rejects a workflow outcome that resolves a node outside its definition", () => {
  const invalid = structuredClone(workflows.scholarship);
  invalid.nodes[0]!.onConfirm.resolves = "missing-node";
  expect(workflowDefinitionSchema.safeParse(invalid).success).toBe(false);
});

/** Walks a case forward until the named node is the current action. */
function confirmUntil(caseSnapshot: CaseSnapshot, nodeId: string): CaseSnapshot {
  let snapshot = caseSnapshot;

  for (let guard = 0; guard < 40 && currentNode(snapshot)?.id !== nodeId; guard += 1) {
    const open = currentNode(snapshot);
    snapshot = open?.report
      ? recordDeskReport(snapshot, {
          optionId: open.report.options[0]!.id,
          response: "Synthetic test response",
          responseDate: "2026-09-05",
          recordedAt: "2026-09-06T10:00:00.000Z",
        }).caseSnapshot
      : open
        ? applyIntent(snapshot, "affirmative").caseSnapshot
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
      const open = currentNode(snapshot);
      const result = open?.report
        ? recordDeskReport(snapshot, {
            optionId: open.report.options[0]!.id,
            response: "Synthetic test response",
            responseDate: "2026-09-05",
            recordedAt: "2026-09-06T10:00:00.000Z",
          })
        : open
          ? applyIntent(snapshot, "affirmative")
          : advanceDay(snapshot);

      expect(missingTranslations(result.reply, "reply")).toEqual([]);
      snapshot = result.caseSnapshot;
    }

    // The idle replies, produced once no node is open, are localized too.
    expect(missingTranslations(applyIntent(snapshot, "affirmative").reply, "reply")).toEqual([]);
  });
});

describe("workflow seeds", () => {
  test("a student without a response gets payment-check preparation first", () => {
    const fresh = startCase("scholarship");
    const check = currentNode(fresh)!;
    expect(check.id).toBe("pfms-trace");
    expect(check.detail.en).toContain("PFMS");
    expect(check.link?.url).toBe("https://pfms.nic.in/SitePages/DBT_StatusTracker.aspx");
    expect(check.visit?.carry.length).toBeGreaterThan(0);
    expect(check.visit?.script.en).toContain("payment");
    expect(check.visit?.collect.en).toContain("reference");
    expect(check.detail.en).toContain("no response");
  });
  test("grievance preparation leaves payment unresolved until a submitted response and confirmed credit", () => {
    const ready = confirmUntil(startCase("scholarship"), "grievance");
    expect(ready.artifacts).toContain("escalation-draft");
    const unchanged = applyIntent(ready, "affirmative").caseSnapshot;
    expect(currentNode(unchanged)?.id).toBe("grievance");
    expect(stateOf(unchanged, "verify-again")).toBe("blocked");
    const submitted = recordDeskReport(unchanged, {
      optionId: "submitted", response: "SYNTHETIC: submitted to scheme grievance desk", referenceNumber: "SYN-ACK-1",
      responseDate: "2026-09-06", recordedAt: "2026-09-06T10:00:00.000Z",
    }).caseSnapshot;
    expect(currentNode(submitted)?.id).toBe("credit");
    expect(stateOf(submitted, "verify-again")).toBe("blocked");
    const credited = applyIntent(submitted, "affirmative").caseSnapshot;
    expect(stateOf(credited, "verify-again")).toBe("done");
  });

  test("bank preparation includes the checklist before the branch response", () => {
    const ready = confirmUntil(startCase("scholarship"), "bank-seeding");
    expect(ready.artifacts).toContain("npci-checklist");
    expect(ready.reports?.some((report) => report.stepId === "bank-seeding")).toBe(false);
  });
  test("an older case keeps using its exact workflow version after a newer version is registered", () => {
    const original = workflows.scholarship;
    const versionOne = structuredClone(original) as WorkflowDefinition;
    const versionTwo = structuredClone(original) as WorkflowDefinition;
    versionOne.nodes[0].ask.en = "Version one question";
    versionTwo.nodes[0].ask.en = "Version two question";

    registerWorkflowDefinition(versionOne, "scholarship-v1-test");
    const olderCase = startCase("scholarship", "scholarship-v1-test");
    registerWorkflowDefinition(versionTwo, "scholarship-v2-test");
    const newerCase = startCase("scholarship", "scholarship-v2-test");

    expect(currentNode(olderCase)?.ask.en).toBe("Version one question");
    expect(currentNode(newerCase)?.ask.en).toBe("Version two question");
  });

  test("all bundled journeys are powered by one engine and share step types", () => {
    expect(workflowIds).toEqual(["bereavement", "scholarship", "punjab-income", "aadhaar-update", "epfo-claim"]);
    expect(sharedStepTypes()).toEqual(
      expect.arrayContaining(["desk-verification", "case-complete"]),
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

describe("applyIntent", () => {
  test("an unclear reply repeats the question and changes nothing", () => {
    const caseSnapshot = startCase("bereavement");
    const result = applyIntent(caseSnapshot, "unknown");

    expect(result.caseSnapshot).toEqual(caseSnapshot);
    expect(result.reply).toEqual(currentNode(caseSnapshot)!.ask);
  });

  test("a negative reply never advances a confirmation-only node", () => {
    const caseSnapshot = confirmUntil(startCase("bereavement"), "form4-explain");
    const result = applyIntent(caseSnapshot, "negative");

    expect(result.caseSnapshot).toEqual(caseSnapshot);
    expect(stateOf(result.caseSnapshot, "name-check")).toBe("pending");
  });

  test("declining the name check opens the correction path instead of the bank claim", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const { caseSnapshot, reply } = applyIntent(atNameCheck, "negative");

    expect(stateOf(caseSnapshot, "name-check")).toBe("blocked");
    expect(stateOf(caseSnapshot, "name-correction")).toBe("needs-you");
    expect(stateOf(caseSnapshot, "bank-claim")).toBe("pending");
    expect(t(reply, "hi")).toContain("सुधार");
    expect(t(reply, "en")).toContain("correction");
  });

  test("confirming the correction records the declaration artifact once", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const declined = applyIntent(atNameCheck, "negative").caseSnapshot;
    const corrected = applyIntent(declined, "affirmative").caseSnapshot;

    expect(corrected.artifacts).toEqual(["correction-declaration"]);
    expect(stateOf(corrected, "bank-claim")).toBe("needs-you");
  });
});

describe("citizen-reported desk responses", () => {
  test("records the citizen's evidence before opening the supported recovery path", () => {
    const atTrace = applyIntent(
      confirmUntil(startCase("scholarship"), "pfms-trace"),
      "affirmative",
    ).caseSnapshot;

    const result = recordDeskReport(atTrace, {
      optionId: "npci-missing",
      response: "The PFMS desk said the bank returned the payment because NPCI mapping was missing.",
      responseDate: "2026-09-05",
      referenceNumber: "PFMS-DEMO-44",
      evidence: "Fictional screenshot noted for the demo.",
      recordedAt: "2026-09-06T10:00:00.000Z",
    });

    expect(stateOf(result.caseSnapshot, "pfms-trace")).toBe("blocked");
    expect(stateOf(result.caseSnapshot, "bank-seeding")).toBe("needs-you");
    expect(result.caseSnapshot.reports).toEqual([{
      stepId: "pfms-trace",
      optionId: "npci-missing",
      response: "The PFMS desk said the bank returned the payment because NPCI mapping was missing.",
      responseDate: "2026-09-05",
      referenceNumber: "PFMS-DEMO-44",
      evidence: "Fictional screenshot noted for the demo.",
      recordedAt: "2026-09-06T10:00:00.000Z",
      synthetic: true,
    }]);
  });

  test("records an unsupported response without inventing a recovery path", () => {
    const atTrace = applyIntent(
      confirmUntil(startCase("scholarship"), "pfms-trace"),
      "affirmative",
    ).caseSnapshot;

    const result = recordDeskReport(atTrace, {
      optionId: "different",
      response: "The desk gave a different reason.",
      responseDate: "2026-09-05",
      recordedAt: "2026-09-06T10:00:00.000Z",
    });

    expect(stateOf(result.caseSnapshot, "pfms-trace")).toBe("blocked");
    expect(stateOf(result.caseSnapshot, "bank-seeding")).toBe("pending");
    expect(t(result.reply, "en")).toContain("recorded");
    expect(t(result.reply, "en")).not.toContain("NPCI");
  });

  test("renders a grievance draft from the citizen's confirmed case record", () => {
    const snapshot = {
      ...startCase("scholarship"),
      reports: [{
        stepId: "pfms-trace",
        optionId: "npci-missing",
        response: "Payment was returned because NPCI mapping was missing.",
        responseDate: "2026-09-05",
        referenceNumber: "PFMS-DEMO-44",
        evidence: "Acknowledgement screenshot",
        recordedAt: "2026-09-06T10:00:00.000Z",
        synthetic: true,
      }],
    };

    const body = renderArtifactBody("escalation-draft", snapshot, "en").join(" ");

    expect(body).toContain("Payment was returned because NPCI mapping was missing.");
    expect(body).toContain("5 Sep 2026");
    expect(body).toContain("PFMS-DEMO-44");
    expect(body).toContain("Acknowledgement screenshot");
    expect(body).toContain("has not submitted");
  });
});

describe("advanceDay", () => {
  test("does not move time when no desk verification is pending", () => {
    const freshCase = startCase("scholarship");
    const result = advanceDay(freshCase);

    expect(result.caseSnapshot).toBe(freshCase);
    expect(result.caseSnapshot.day).toBe(0);
    expect(currentNode(result.caseSnapshot)?.id).toBe("pfms-trace");
  });

});

describe("complete journeys", () => {
  test("bereavement reaches completion with every demanded proof point", () => {
    const finished = confirmUntil(startCase("bereavement"), "case-done");
    const done = applyIntent(finished, "affirmative").caseSnapshot;

    // The correction branch stays untaken here: this walk confirms the name.
    expect(stateOf(done, "name-correction")).toBe("pending");
    expect(done.nodes.some((node) => node.state === "needs-you" || node.state === "verifying"))
      .toBe(false);
    expect(stateOf(done, "case-done")).toBe("done");
    expect(done.artifacts).toEqual(["bank-letter", "rti-draft"]);
    expect(t(applyIntent(done, "affirmative").reply, "hi")).toContain("Case Card");
    expect(t(applyIntent(done, "affirmative").reply, "en")).toContain("Case Card");
  });

  test("scholarship reuses the same engine through its bounce and breach", () => {
    const finished = confirmUntil(startCase("scholarship"), "case-done");

    // Both citizen-reported setbacks were closed by their supported recovery step.
    expect(isClearedBlocker(finished, "pfms-trace")).toBe(true);
    expect(isClearedBlocker(finished, "verify-again")).toBe(true);
    expect(t(nodeNote(finished, "pfms-trace")!, "hi")).toContain("NPCI");
    expect(t(nodeNote(finished, "pfms-trace")!, "en")).toContain("NPCI");
    expect(t(nodeNote(finished, "verify-again")!, "hi")).toContain("नागरिक");
    expect(t(nodeNote(finished, "verify-again")!, "en")).toContain("Citizen-reported");
    expect(finished.artifacts).toEqual(["npci-checklist", "escalation-draft"]);
  });
});

describe("recovery closes what it recovered from", () => {
  test("a rejected bank claim is closed once its fix is confirmed, keeping the reason", () => {
    const atBank = confirmUntil(startCase("bereavement"), "bank-claim");
    const rejected = recordDeskReport(atBank, {
      optionId: "signature-mismatch",
      response: "The bank said the signature did not match.",
      responseDate: "2026-09-05",
      recordedAt: "2026-09-06T10:00:00.000Z",
    }).caseSnapshot;

    expect(stateOf(rejected, "bank-claim")).toBe("blocked");
    expect(t(nodeNote(rejected, "bank-claim")!, "hi")).toContain("नागरिक");
    expect(t(nodeNote(rejected, "bank-claim")!, "en")).toContain("Citizen-reported");
    expect(isClearedBlocker(rejected, "bank-claim")).toBe(false);

    const recovered = applyIntent(rejected, "affirmative").caseSnapshot;

    expect(stateOf(recovered, "bank-claim")).toBe("done");
    expect(isClearedBlocker(recovered, "bank-claim")).toBe(true);
    expect(t(nodeNote(recovered, "bank-claim")!, "hi")).toContain("नागरिक");
    expect(t(nodeNote(recovered, "bank-claim")!, "en")).toContain("Citizen-reported");
  });

  test("a declined name check is closed once the correction is added", () => {
    const atNameCheck = confirmUntil(startCase("bereavement"), "name-check");
    const declined = applyIntent(atNameCheck, "negative").caseSnapshot;
    const corrected = applyIntent(declined, "affirmative").caseSnapshot;

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
      const finished = applyIntent(
        confirmUntil(startCase(workflowId), "case-done"),
        "affirmative",
      ).caseSnapshot;

      expect(finished.nodes.filter((node) => node.state === "blocked")).toHaveLength(0);
      expect(finished.nodes.some((node) => isClearedBlocker(finished, node.id))).toBe(true);
    },
  );
});
