import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetCorroboration } from "@/lib/corroboration";
import { t, type Locale, type Localized } from "@/lib/locale";
import { POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

// Corroboration is a module-level ledger, so each test starts from a clean count.
beforeEach(resetCorroboration);

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
  mock.restore();
});


/** Joins a localized list into one string so a test can search it. */
function read(values: Localized[], locale: Locale): string {
  return values.map((value) => t(value, locale)).join(" ");
}

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
        body: JSON.stringify({ input: "a".repeat(2_001) }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("falls back when OpenRouter setup fails", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: () => {
        throw new Error("Provider setup failed");
      },
    }));
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
  });

  test("preserves server-derived conflict evidence on the provider path", async () => {
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
          expect(options.timeout).toBe(15_000);
          await this.settings.tools.compileDraft.execute({
            title: "Provider-enriched title",
            steps: ["Provider-enriched step"],
            additions: ["Provider-enriched addition"],
          });
          return { text: "ignored" };
        }
      },
    }));
    const response = await POST(
      new Request("http://localhost/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
        body: JSON.stringify({ input: "Form 4 listed Shyam Sundar for the bank claim." }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      sourceType: "lived experience",
      corroborationCount: 1,
      status: "needs review",
    });
    // The model wrote in Hindi (the default locale); English keeps the
    // deterministic text, so the draft is never left half-written.
    expect(body.title.hi).toBe("Provider-enriched title");
    expect(body.title.en).not.toBe("Provider-enriched title");
    expect(read(body.steps, "hi")).toContain("Provider-enriched step");
    expect(read(body.additions, "hi")).toContain("Provider-enriched addition");
    expect(body.matches.length).toBeGreaterThan(0);
    expect(body.conflicts).toContainEqual(
      expect.objectContaining({
        submitted: { hi: "Shyam Sundar", en: "Shyam Sundar" },
        bundled: { hi: "Shyam Sunder", en: "Shyam Sunder" },
      }),
    );
  });

  test("keeps server-derived additions when the provider returns its own", async () => {
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
          await this.settings.tools.compileDraft.execute({
            title: "Provider title",
            steps: ["Provider step"],
            additions: ["Provider addition"],
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
          input: "At the office an agent wanted a \u20b9500 fee for the death claim.",
        }),
      }),
    );
    const body = await response.json();

    expect(read(body.additions, "hi")).toContain("Provider addition");
    // Server-derived flags survive in both languages.
    expect(read(body.additions, "en")).toContain("payment");
    expect(read(body.additions, "en")).toContain("middleman");
  });
});
