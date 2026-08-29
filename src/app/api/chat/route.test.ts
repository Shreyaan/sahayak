import { afterEach, describe, expect, test } from "bun:test";
import { initialCase } from "@/lib/case";
import { POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
});

describe("POST /api/chat", () => {
  test("uses the deterministic path when OpenRouter is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const request = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "हाँ", caseSnapshot: initialCase }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });
});
