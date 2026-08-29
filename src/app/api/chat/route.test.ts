import { afterEach, describe, expect, mock, test } from "bun:test";
import { initialCase } from "@/lib/case";
import { POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
  mock.restore();
});

function chatRequest(body: unknown, ip = crypto.randomUUID()) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  test("uses the deterministic path when OpenRouter is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const request = chatRequest({ message: "हाँ", caseSnapshot: initialCase });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });

  test.each([
    { ...initialCase, id: "client-case" },
    {
      ...initialCase,
      nodes: [
        initialCase.nodes[0],
        { ...initialCase.nodes[1], title: "Pay an invented fee" },
      ],
    },
    {
      ...initialCase,
      nodes: [
        { ...initialCase.nodes[0], state: "pending" },
        { ...initialCase.nodes[1], state: "pending" },
      ],
    },
  ])("rejects a client-authored case snapshot", async (caseSnapshot) => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(chatRequest({ message: "हाँ", caseSnapshot }));

    expect(response.status).toBe(400);
  });

  test("rejects messages longer than 2,000 characters", async () => {
    const response = await POST(
      chatRequest({ message: "a".repeat(2_001), caseSnapshot: initialCase }),
    );

    expect(response.status).toBe(400);
  });

  test("returns the server-authorized reply even when provider prose invents policy", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    let observedTimeout: number | undefined;
    mock.module("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: () => () => ({ modelId: "test-model" }),
    }));
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        private settings: any;

        constructor(settings: any) {
          this.settings = settings;
        }

        async generate(options: { timeout?: number }) {
          observedTimeout = options.timeout;
          await this.settings.tools.getCaseOutcome.execute({});
          return { text: "Pay an invented ₹999 fee before the bank claim." };
        }
      },
    }));

    const response = await POST(
      chatRequest({ message: "हाँ", caseSnapshot: initialCase }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(observedTimeout).toBe(15_000);
    expect(body.reply).toBe(
      "ठीक है। अब बैंक क्लेम तैयार करते हैं। मैं जरूरी कागज़ों की सूची दिखा रहा हूँ।",
    );
    expect(body.reply).not.toContain("₹99");
  });
});
