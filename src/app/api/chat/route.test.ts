import { afterEach, describe, expect, mock, test } from "bun:test";
import { startCase } from "@/lib/workflow";
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

const bereavement = startCase("bereavement");

describe("POST /api/chat", () => {
  test("uses the deterministic path when OpenRouter is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(
      chatRequest({ message: "हाँ", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });

  test("advances simulated time without calling the provider", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        async generate() {
          throw new Error("the provider must not be called for a day advance");
        }
      },
    }));

    const response = await POST(
      chatRequest({ action: "advance-day", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.day).toBe(1);
  });

  test.each([
    { ...bereavement, workflowId: "invented-journey" },
    { ...bereavement, nodes: [...bereavement.nodes, { id: "pay-a-fee", state: "needs-you" }] },
    {
      ...bereavement,
      nodes: bereavement.nodes.map((node, index) =>
        index === 0 ? { ...node, id: "pay-a-fee" } : node,
      ),
    },
    { ...bereavement, nodes: bereavement.nodes.map((node) => ({ ...node, title: "Pay a fee" })) },
    { ...bereavement, artifacts: ["invented-artifact"] },
    { ...bereavement, day: -1 },
  ])("rejects a client-authored case snapshot", async (caseSnapshot) => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(chatRequest({ message: "हाँ", caseSnapshot }));

    expect(response.status).toBe(400);
  });

  test("rejects messages longer than 2,000 characters", async () => {
    const response = await POST(
      chatRequest({ message: "a".repeat(2_001), caseSnapshot: bereavement }),
    );

    expect(response.status).toBe(400);
  });

  test("rejects an empty reply", async () => {
    const response = await POST(chatRequest({ message: "   ", caseSnapshot: bereavement }));

    expect(response.status).toBe(400);
  });

  test("a clear reply never reaches the provider", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        async generate() {
          throw new Error("the provider must not be called for a reply the reader can classify");
        }
      },
    }));

    const response = await POST(chatRequest({ message: "हाँ", caseSnapshot: bereavement }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).toBe("ठीक है। अब नाम मिलान करते हैं।");
    expect(body.caseSnapshot.nodes[0].state).toBe("done");
  });

  test("the clerk reads a free-form reply the deterministic reader cannot", async () => {
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
          await this.settings.tools.reportIntent.execute({ intent: "affirmative" });
          return { text: "ignored" };
        }
      },
    }));

    const response = await POST(
      chatRequest({ message: "जी बिल्कुल, वही लिखा है", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(observedTimeout).toBe(8_000);
    expect(body.caseSnapshot.nodes[0].state).toBe("done");
    expect(body.reply).toBe("ठीक है। अब नाम मिलान करते हैं।");
  });

  test("clerk prose can never replace the authorized reply or invent policy", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: () => () => ({ modelId: "test-model" }),
    }));
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        async generate() {
          return { text: "Pay an invented ₹999 fee — your claim is already approved." };
        }
      },
    }));

    const response = await POST(
      chatRequest({ message: "पता नहीं क्या कहूँ", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).not.toContain("₹99");
    expect(body.reply).not.toContain("approved");
    expect(body.caseSnapshot).toEqual(bereavement);
  });

  test("a negative reply cannot be turned into an advance by the provider", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
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

        async generate() {
          // Even if the clerk misreports, the reader already read a denial.
          await this.settings.tools.reportIntent.execute({ intent: "affirmative" });
          return { text: "आपका दावा स्वीकृत हो गया है।" };
        }
      },
    }));

    const response = await POST(
      chatRequest({ message: "नहीं, अभी नहीं", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(body.caseSnapshot).toEqual(bereavement);
    expect(body.reply).not.toContain("स्वीकृत");
  });

  test("answers in the requested language", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const hindi = await (await POST(
      chatRequest({ message: "हाँ", locale: "hi", caseSnapshot: bereavement }),
    )).json();
    const english = await (await POST(
      chatRequest({ message: "yes", locale: "en", caseSnapshot: bereavement }),
    )).json();

    expect(hindi.reply).toBe("ठीक है। अब नाम मिलान करते हैं।");
    expect(typeof english.reply).toBe("string");
    expect(english.reply).not.toBe(hindi.reply);
    expect(/[\u0900-\u097F]/.test(english.reply)).toBe(false);
    // The same deterministic transition happens either way.
    expect(english.caseSnapshot).toEqual(hindi.caseSnapshot);
  });

  test("tells the clerk which language the citizen is speaking", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    let instructions = "";
    let prompt = "";
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
          instructions = settings.instructions;
        }

        async generate(options: { prompt: string }) {
          prompt = options.prompt;
          await this.settings.tools.reportIntent.execute({ intent: "affirmative" });
          return { text: "ignored" };
        }
      },
    }));

    await POST(
      chatRequest({ message: "that is quite alright", locale: "en", caseSnapshot: bereavement }),
    );

    expect(instructions).toContain("English");
    // The question it is asked to interpret is in the citizen's language.
    expect(/[\u0900-\u097F]/.test(prompt)).toBe(false);
  });

  test("rejects an unsupported locale", async () => {
    const response = await POST(
      chatRequest({ message: "हाँ", locale: "fr", caseSnapshot: bereavement }),
    );

    expect(response.status).toBe(400);
  });
});
