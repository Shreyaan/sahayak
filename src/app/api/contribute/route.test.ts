import { afterEach, describe, expect, test } from "bun:test";
import { POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
});

describe("POST /api/contribute", () => {
  test("returns the deterministic contribution draft without OpenRouter", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const request = new Request("http://localhost/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "I submitted a bank claim after my father died." }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceType: "lived experience",
      corroborationCount: 1,
      status: "draft",
    });
    expect(body.steps.length).toBeGreaterThan(0);
  });

  test("rejects blank contribution input", async () => {
    const request = new Request("http://localhost/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "   " }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
