import { beforeAll, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { POST } from "./route";

beforeAll(seedPublishedWorkflows);

test("unsupported discovery stops after one clarification even without an AI provider", async () => {
  const key = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const request = (clarificationAttempt: number) => new Request("http://localhost/api/search", {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify({ query: "SYNTHETIC driving licence renewal at RTO", locale: "en", clarificationAttempt }),
  });
  try {
    const first = await POST(request(0));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ results: [], shouldClarify: true, clarificationQuestion: expect.any(String) });
    const second = await POST(request(1));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ results: [], shouldClarify: false, unsupported: true });
  } finally {
    if (key === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = key;
  }
});
