import { expect, test } from "bun:test";
import { compileGeneratedContribution, type GeneratedContribution } from "./contribution";

const evidence: GeneratedContribution = {
  title: {en: "Correct a water bill", hi: "पानी का बिल सुधारें"},
  summary: {en: "A reported billing correction", hi: "बताया गया बिल सुधार"},
  steps: [{kind: "desk", title: {en: "Ask the water office", hi: "जल कार्यालय से पूछें"}, detail: {en: "Ask about the recorded discrepancy", hi: "दर्ज अंतर के बारे में पूछें"}, ask: {en: "What did they say?", hi: "उन्होंने क्या कहा?"}}],
  reviewFlags: [{en: "Verify the office procedure", hi: "कार्यालय प्रक्रिया की जाँच करें"}],
  jurisdiction: {scope: "central", reason: {en: "Needs verification", hi: "जाँच आवश्यक"}},
};

test("compiles structured evidence without copying a bundled topic or inventing desk outcomes", () => {
  const draft = compileGeneratedContribution(evidence);
  expect(draft.title).toEqual(evidence.title);
  expect(draft.definition.nodes[0].detail).toEqual(evidence.steps[0].detail);
  expect(draft.definition.nodes[0].verify).toBeUndefined();
  expect(draft.definition.nodes[0].visit).toBeUndefined();
  expect(draft.matches).toEqual([]);
  expect(draft.additions).toContainEqual(evidence.reviewFlags[0]);
  expect(draft.additions.at(-1)?.en).toContain("Expert verification");
});

test("rejects malformed model output at the compiler boundary", () => {
  expect(() => compileGeneratedContribution({...evidence, steps: []})).toThrow();
});

test("independent drafts have unique IDs even with identical titles", () => {
  expect(compileGeneratedContribution(evidence).workflowId).not.toBe(compileGeneratedContribution(evidence).workflowId);
});
