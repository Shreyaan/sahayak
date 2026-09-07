import { afterEach, describe, expect, mock, test } from "bun:test";
import { t, type Locale, type Localized } from "@/lib/locale";
import { POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
  mock.restore();
});


/** Joins a localized list into one string so a test can search it. */
function read(values: Localized[], locale: Locale): string {
  return values.map((value) => t(value, locale)).join(" ");
}

describe("POST /api/contribute", () => {
  test("reports draft preparation unavailable without OpenRouter", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const request = new Request("http://localhost/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "I submitted a bank claim after my father died.", jurisdiction: { scope: "central" } }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: { code: "AI_UNAVAILABLE", message: "Draft preparation is unavailable right now." },
    });
  });

  test("rejects blank contribution input", async () => {
    const request = new Request("http://localhost/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "   ", jurisdiction: { scope: "central" } }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_CONTRIBUTION", message: "Contribution input is required." } });
  });

  test("rejects malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
  });

  test("rejects contribution input longer than 2,000 characters", async () => {
    const response = await POST(
      new Request("http://localhost/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ input: "a".repeat(2_001), jurisdiction: { scope: "central" } }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("reports OpenRouter setup failure", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: () => {
        throw new Error("Provider setup failed");
      },
    }));
    const request = new Request("http://localhost/api/contribute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "I submitted a bank claim after my father died.", jurisdiction: { scope: "central" } }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      error: { code: "AI_UNAVAILABLE", message: "Draft preparation is unavailable right now." },
    });
  });

  test("compiles the model's bilingual actions into an unpublished review draft", async () => {
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

        async generate(options: { timeout?: number }) {
          expect(options.timeout).toBe(30_000);
          await this.settings.tools.draftJourney.execute({
            title: { hi: "लाइसेंस नवीनीकरण", en: "Driving licence renewal" },
            summary: { hi: "विशेषज्ञ समीक्षा का मसौदा", en: "A draft for expert review" },
            steps: [{
              title: { hi: "स्थिति पूछें", en: "Ask for the current status" },
              detail: { hi: "रसीद के साथ स्थिति पूछें।", en: "Ask for the status using the receipt." },
              ask: { hi: "क्या स्थिति मिली?", en: "Did you receive the status?" },
              kind: "desk",
            }],
            jurisdiction: {scope: "central", reason: {en: "Test", hi: "परीक्षण"}},
            reviewFlags: [{ hi: "सही कार्यालय जाँचें।", en: "Verify the correct office." }],
          });
          return { text: "ignored" };
        }
      },
    }));
    const response = await POST(
      new Request("http://localhost/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ input: "My driving licence renewal is pending.", jurisdiction: { scope: "central" } }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceType: "lived experience",
    });
    expect(body.workflowId.startsWith("custom-")).toBe(true);
    expect(body.title).toEqual({ hi: "लाइसेंस नवीनीकरण", en: "Driving licence renewal" });
    expect(body.definition.authoredBy).toBe("web-form");
    expect(body.definition.nodes[0].type).toBe("desk-verification");
    expect(body.matches).toEqual([]);
    expect(body.conflicts).toEqual([]);
  });

  test("keeps model review gaps and adds the publication verification boundary", async () => {
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
          await this.settings.tools.draftJourney.execute({
            title: { hi: "दावा", en: "Claim" },
            summary: { hi: "समीक्षा मसौदा", en: "Review draft" },
            steps: [{
              title: { hi: "रसीद देखें", en: "Check the receipt" },
              detail: { hi: "रसीद पर दर्ज बात देखें।", en: "Read what the receipt records." },
              ask: { hi: "क्या रसीद मिली?", en: "Do you have the receipt?" },
              kind: "confirm",
            }],
            jurisdiction: {scope: "central", reason: {en: "Test", hi: "परीक्षण"}},
            reviewFlags: [{ hi: "समय-सीमा जाँचें।", en: "Verify the timeline." }],
          });
          return { text: "ignored" };
        }
      },
    }));

    const response = await POST(
      new Request("http://localhost/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({
          input: "The office kept my receipt and asked me to return.", jurisdiction: { scope: "central" },
        }),
      }),
    );
    const body = await response.json();

    expect(read(body.additions, "en")).toContain("Verify the timeline");
    expect(read(body.additions, "en")).toContain("Expert verification");
  });

  test("rejects a provider response that does not call the draft tool", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: () => () => ({ modelId: "test-model" }) }));
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        async generate() {}
      },
    }));
    const response = await POST(new Request("http://localhost/api/contribute", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
      body: JSON.stringify({ input: "I submitted a bank claim after my father died.", jurisdiction: { scope: "central" } }),
    }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: { code: "AI_INVALID_RESPONSE", message: "Draft preparation did not return a usable result." },
    });
  });
});
