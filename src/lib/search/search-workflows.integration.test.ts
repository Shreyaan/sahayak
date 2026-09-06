import { beforeAll, describe, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { searchWorkflows } from "./search-workflows";

beforeAll(async () => {
  await seedPublishedWorkflows();
});

describe("searchWorkflows", () => {
  test.each([
    "scholarship payment stuck",
    "scholorship paisa nahi aaya",
    "छात्रवृत्ति का पैसा नहीं आया",
  ])("finds the scholarship journey for %s", async (query) => {
    const response = await searchWorkflows({ query, locale: "en", limit: 3 });

    expect(response.shouldClarify).toBe(false);
    expect(response.results[0]?.workflowId).toBe("scholarship");
    expect(response.results[0]?.workflowVersionId).toBe("scholarship-v4");
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
