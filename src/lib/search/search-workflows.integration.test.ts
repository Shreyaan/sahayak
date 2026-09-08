import { beforeAll, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { searchWorkflows } from "./search-workflows";
import type { AssessWorkflowFit } from "./assess-workflow-fit";

beforeAll(() => seedPublishedWorkflows());

// These test retrieval and the assessment boundary, not a mocked model's language ability.
const select = (id: string): AssessWorkflowFit => async ({candidates}) => {
  expect(candidates.some(candidate => candidate.workflowVersionId === id)).toBe(true);
  return {decision: "match", workflowVersionId: id};
};

test.each([
  ["scholarship payment stuck", "scholarship-v6"],
  ["scholorship paisa nahi aaya", "scholarship-v6"],
  ["छात्रवृत्ति का पैसा नहीं आया", "scholarship-v6"],
  ["death claim bank form 4", "bereavement-v2"],
  ["aadhar update reject ho gaya", "aadhaar-update-v1"],
  ["EPFO PF withdrawal claim rejected", "epfo-claim-v1"],
])("retrieves a published candidate before structured assessment: %s", async (query, id) => {
  const result = await searchWorkflows({query, locale: "en"}, select(id));
  expect(result.results.map(row => row.workflowVersionId)).toEqual([id]);
  expect(result.results[0].requiresConfirmation).toBe(false);
});

test("jurisdiction is enforced before the LLM sees candidates", async () => {
  await searchWorkflows({query: "income certificate pending sewa kendra", locale: "en", stateCode: "PB"}, select("punjab-income-v1"));
  for (const stateCode of [undefined, "KA"]) {
    await searchWorkflows({query: "income certificate pending sewa kendra", locale: "en", stateCode}, async ({candidates}) => {
      expect(candidates.some(row => row.workflowVersionId === "punjab-income-v1")).toBe(false);
      return {decision: "unsupported"};
    });
  }
});

test("unsupported assessment suppresses related topic matches", async () => {
  const result = await searchWorkflows({query: "scholarship first application", locale: "en"}, async () => ({decision: "unsupported"}));
  expect(result.results).toEqual([]);
  expect(result.unsupported).toBe(true);
});

test("keeps the grounded clarification and never accepts an invented version", async () => {
  const input = {query: "scholarship", locale: "en" as const};
  const question = await searchWorkflows(input, async () => ({decision: "clarify", question: "Have you already applied?"}));
  expect(question.clarificationQuestion).toBe("Have you already applied?");
  const invented = await searchWorkflows(input, async () => ({decision: "match", workflowVersionId: "invented"}));
  expect(invented.results).toEqual([]);
});

test("provider failure offers only explicitly unconfirmed retrieved options", async () => {
  const result = await searchWorkflows({query: "scholarship", locale: "en"}, async () => ({decision: "unavailable"}));
  expect(result.results.length).toBeGreaterThan(0);
  expect(result.results.every(row => row.requiresConfirmation)).toBe(true);
});


test("small-catalogue assessment starts while query embedding is still pending", async () => {
  let release!: () => void;
  const embedding = new Promise<number[]>((_, reject) => {release = () => reject(new Error("test provider unavailable"));});
  let assessed!: () => void;
  const started = new Promise<void>(resolve => {assessed = resolve;});
  const search = searchWorkflows({query: "scholorship ka paisa nahi aaya", locale: "en"}, async ({candidates}) => {
    expect(candidates.length).toBeLessThanOrEqual(8);
    assessed();
    return {decision: "match", workflowVersionId: "scholarship-v6"};
  }, () => embedding);
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([started, new Promise((_, reject) => {timer = setTimeout(() => reject(new Error("Assessment waited for embedding")), 1000);})]);
  } finally {
    clearTimeout(timer!);
    release();
  }
  expect((await search).results[0]?.workflowVersionId).toBe("scholarship-v6");
});
