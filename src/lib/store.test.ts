import { describe, expect, test } from "bun:test";
import { resetMemoryStore, store } from "./store";
import { startCase, type CaseSnapshot } from "./workflow";

const snapshot: CaseSnapshot = { ...startCase("bereavement") };

describe("memory store", () => {
  test("rejects a stale progress save instead of acknowledging lost evidence", async () => {
    resetMemoryStore();
    const original = structuredClone(snapshot);
    await store.saveCase("concurrent-case", original, "owner");
    await store.saveCaseProgress("concurrent-case", { ...original, day: 1 }, "owner", original);
    await expect(store.saveCaseProgress("concurrent-case", { ...original, day: 2 }, "owner", original))
      .rejects.toThrow("CASE_CONFLICT");
    expect((await store.getCase("concurrent-case", "owner"))?.snapshot.day).toBe(1);
  });
  test("persists and lists cases, newest first", async () => {
    resetMemoryStore();

    const a = { ...snapshot, day: 1 };
    await store.saveCase("case-a", a);

    const b = { ...snapshot, day: 2 };
    await store.saveCase("case-b", b);

    const cases = await store.listCases(10);
    expect(cases.map((entry) => entry.id)).toEqual(["case-b", "case-a"]);
    expect(cases[0].snapshot.day).toBe(2);
  });

  test("updating a case keeps one row per id", async () => {
    resetMemoryStore();

    await store.saveCase("case-a", snapshot);
    await store.saveCase("case-a", { ...snapshot, day: 3 });

    const cases = await store.listCases(10);
    expect(cases).toHaveLength(1);
    expect(cases[0].snapshot.day).toBe(3);
  });

  test("saving an AI artifact draft preserves newer case progress", async () => {
    resetMemoryStore();
    const draft = {
      schemaVersion: "scholarship-grievance-v1" as const,
      artifactId: "escalation-draft" as const,
      fields: { applicantName: "Asha", applicationId: "APP-1", contact: "", bankAccountLastFour: "", destination: "NSP portal" },
      document: {
        en: { recipient: "NSP portal", subject: "Payment missing", body: "Payment was not credited.", request: "Please reply in writing.", enclosures: "" },
        hi: { recipient: "एनएसपी पोर्टल", subject: "भुगतान नहीं मिला", body: "भुगतान जमा नहीं हुआ।", request: "कृपया लिखित उत्तर दें।", enclosures: "" },
      },
      generatedAt: "2026-09-06T10:00:00.000Z",
      model: "openai/gpt-5.6-luna",
    };
    await store.saveCase("case-a", snapshot);
    await store.saveCase("case-a", { ...snapshot, day: 3 });

    await store.saveArtifactDraft("case-a", draft);

    const saved = await store.getCase("case-a");
    expect(saved?.snapshot.day).toBe(3);
    expect(saved?.snapshot.artifactDrafts?.["escalation-draft"]?.document.en.subject).toBe("Payment missing");
  });

  test("saving case progress preserves an artifact draft saved after the case was read", async () => {
    resetMemoryStore();
    const draft = {
      schemaVersion: "scholarship-grievance-v1" as const,
      artifactId: "escalation-draft" as const,
      fields: { applicantName: "Asha", applicationId: "APP-1", contact: "", bankAccountLastFour: "", destination: "NSP portal" },
      document: {
        en: { recipient: "NSP portal", subject: "Payment missing", body: "Payment was not credited.", request: "Please reply in writing.", enclosures: "" },
        hi: { recipient: "एनएसपी पोर्टल", subject: "भुगतान नहीं मिला", body: "भुगतान जमा नहीं हुआ।", request: "कृपया लिखित उत्तर दें।", enclosures: "" },
      },
      generatedAt: "2026-09-06T10:00:00.000Z",
      model: "openai/gpt-5.6-luna",
    };
    await store.saveCase("case-a", snapshot);
    const snapshotReadByChat = structuredClone(snapshot);
    await store.saveArtifactDraft("case-a", draft);

    await store.saveCaseProgress("case-a", { ...snapshotReadByChat, day: 1 }, undefined, snapshotReadByChat);

    const saved = await store.getCase("case-a");
    expect(saved?.snapshot.day).toBe(1);
    expect(saved?.snapshot.artifactDrafts?.["escalation-draft"]?.document.en.subject).toBe("Payment missing");
  });

  test("persists and lists submissions", async () => {
    resetMemoryStore();

    await store.saveSubmission({
      workflowId: "bereavement",
      input: "Form 4 story",
      draft: { title: { hi: "a", en: "b" }, status: "draft" },
    });

    const submissions = await store.listSubmissions(10);
    expect(submissions).toHaveLength(1);
    expect(submissions[0].workflowId).toBe("bereavement");
  });

  test("persists and lists workflow definitions", async () => {
    resetMemoryStore();

    const definition = { id: "custom-x", nodes: [] };
    await store.saveWorkflow(definition, "custom-x");

    const workflows = await store.listWorkflows();
    expect(workflows).toHaveLength(1);
    expect(workflows[0].definition).toEqual(definition);
  });
});
