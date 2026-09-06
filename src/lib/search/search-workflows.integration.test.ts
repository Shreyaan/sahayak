import { beforeAll, describe, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { searchWorkflows } from "./search-workflows";

beforeAll(async () => {
  await seedPublishedWorkflows();
});

test('Punjab income certificate search respects state scope and exact version', async () => {
  const query = 'income certificate pending sewa kendra';
  const result = await searchWorkflows({ query, locale: 'en', stateCode: 'PB' });
  expect(result.results.map(row => row.workflowId)).toEqual(['punjab-income']);
  expect(result.results[0]?.workflowVersionId).toBe('punjab-income-v1');
  expect(result.results[0]?.jurisdiction).toMatchObject({ scope: 'state', stateCode: 'PB' });
  for (const stateCode of [undefined, 'KA']) {
    const elsewhere = await searchWorkflows({ query, locale: 'en', stateCode });
    expect(elsewhere.results).toEqual([]);
  }
  const unrelated = await searchWorkflows({ query: 'birth certificate pending', locale: 'en', stateCode: 'PB' });
  expect(unrelated.results).toEqual([]);
});

describe("searchWorkflows", () => {
  test("never offers a death journey for a licence query that explicitly excludes it", async () => {
    const response = await searchWorkflows({
      query: "mera driving licence renewal pending hai. Sarathi Parivahan Uttar Pradesh. Application processing at RTO, fee paid, no scholarship or death claim involved.",
      locale: "en",
    });
    expect(response.results).toEqual([]);
  });
  test.each([
    "scholarship payment stuck",
    "scholorship paisa nahi aaya",
    "छात्रवृत्ति का पैसा नहीं आया",
  ])("finds the scholarship journey for %s", async (query) => {
    const response = await searchWorkflows({ query, locale: "en", limit: 3 });

    expect(response.shouldClarify).toBe(false);
    expect(response.results[0]?.workflowId).toBe("scholarship");
    expect(response.results[0]?.workflowVersionId).toBe("scholarship-v5");
    expect(response.results[0]?.trust.sourceLinks.some((source) => source.url.startsWith("https://"))).toBe(true);
    expect(response.results[0]?.trust).toMatchObject({
      provenance: "legacy-verification-pending",
      currentExpertSupportCount: 0,
      hasUnresolvedDisagreement: false,
      sourceLinks: expect.any(Array),
    });
  });

  test("does not show a weak journey that only shares the word bank", async () => {
    const response = await searchWorkflows({
      query: "papa death ke baad bank claim",
      locale: "en",
      limit: 3,
    });

    expect(response.results.map((result) => result.workflowId)).toEqual(["bereavement"]);
  });

  test.each([
    "death claim bank form 4",
    "papa death ke baad bank claim",
    "मृत्यु के बाद बैंक दावा",
  ])("finds the bereavement journey for %s", async (query) => {
    const response = await searchWorkflows({ query, locale: "en", limit: 3 });

    expect(response.shouldClarify).toBe(false);
    expect(response.results[0]?.workflowId).toBe("bereavement");
    expect(response.results[0]?.workflowVersionId).toBe("bereavement-v2");
  });

  test("does not invent a journey for an unsupported need", async () => {
    const response = await searchWorkflows({
      query: "I need to renew my driving licence",
      locale: "en",
      limit: 3,
    });

    expect(response.results).toEqual([]);
    expect(response.shouldClarify).toBe(true);
    expect(response.clarificationQuestion).toBeUndefined();
  });
});

 test.each([
  ["aadhar update reject ho gaya", "aadhaar-update"],
  ["आधार अपडेट लंबित है", "aadhaar-update"],
  ["EPFO PF withdrawal claim rejected", "epfo-claim"],
  ["पीएफ निकासी का पैसा नहीं आया", "epfo-claim"],
])("finds the correct new journey for %s", async (query, id) => {
  const result = await searchWorkflows({ query, locale: "hi" });
  expect(result.results.map(row => row.workflowId)).toEqual([id]);
});
