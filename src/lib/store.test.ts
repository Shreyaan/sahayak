import { describe, expect, test } from "bun:test";
import { resetMemoryStore, store } from "./store";
import { startCase, type CaseSnapshot } from "./workflow";

const snapshot: CaseSnapshot = { ...startCase("bereavement") };

describe("memory store", () => {
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
