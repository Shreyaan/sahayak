import { afterEach, describe, expect, mock, test } from "bun:test";
import { resetMemoryStore, store } from "@/lib/store";
import { compileWorkflow, type WorkflowSpec } from "@/lib/custom-workflow";
import { applyCitizenReply, registerWorkflowDefinition, startCase } from "@/lib/workflow";
import { POST } from "./route";
import { browserOwner } from "@/lib/browser-owner";

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

function ownedChatRequest(body: unknown, token: string) {
  const request = chatRequest(body);
  request.headers.set("cookie", `sahayak-browser=${token}`);
  return request;
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

  test("rejects client requests to advance simulated time", async () => {
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

    expect(response.status).toBe(400);
    expect(body.error).toBe("Message and case are required.");
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

  test("redacts citizen identifiers before an ambiguous reply reaches the clerk", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    let prompt = "";
    mock.module("@openrouter/ai-sdk-provider", () => ({
      createOpenRouter: () => () => ({ modelId: "test-model" }),
    }));
    mock.module("ai", () => ({
      isStepCount: () => () => false,
      tool: (definition: unknown) => definition,
      ToolLoopAgent: class {
        async generate(options: { prompt: string }) {
          prompt = options.prompt;
          return { text: "ignored" };
        }
      },
    }));

    await POST(chatRequest({
      message: "maybe ABCDE1234F account 1234567890123456 citizen@example.com",
      caseSnapshot: bereavement,
    }));

    expect(prompt).toContain("[pan]");
    expect(prompt).toContain("[account]");
    expect(prompt).toContain("[email]");
    expect(prompt).not.toContain("ABCDE1234F");
    expect(prompt).not.toContain("1234567890123456");
    expect(prompt).not.toContain("citizen@example.com");
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

  test("persists the case when a caseId is given", async () => {
    delete process.env.OPENROUTER_API_KEY;
    resetMemoryStore();

    const caseId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const ownedRequest = ownedChatRequest({}, token);
    await store.saveCase(caseId, bereavement, browserOwner(ownedRequest).hash);
    const response = await POST(
      ownedChatRequest({ message: "हाँ", caseId, caseSnapshot: bereavement }, token),
    );

    expect(response.status).toBe(200);

    const stored = await store.listCases(10);
    expect(stored.map((entry) => entry.id)).toContain(caseId);
    expect(stored[0].snapshot.nodes[0].state).toBe("done");
  });

  test("continues a saved case without losing its generated grievance", async () => {
    delete process.env.OPENROUTER_API_KEY;
    resetMemoryStore();
    const caseId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const snapshot = {
      ...startCase("scholarship", "scholarship-v4"),
      artifacts: ["escalation-draft" as const],
      artifactDrafts: {
        "escalation-draft": {
          schemaVersion: "scholarship-grievance-v1" as const,
          artifactId: "escalation-draft" as const,
          fields: { applicantName: "Asha", applicationId: "APP-1", contact: "", bankAccountLastFour: "", destination: "NSP portal" },
          document: {
            en: { recipient: "NSP portal", subject: "Payment missing", body: "Payment was not credited.", request: "Please reply in writing.", enclosures: "" },
            hi: { recipient: "एनएसपी पोर्टल", subject: "भुगतान नहीं मिला", body: "भुगतान जमा नहीं हुआ।", request: "कृपया लिखित उत्तर दें।", enclosures: "" },
          },
          generatedAt: "2026-09-06T10:00:00.000Z",
          model: "openai/gpt-5.6-luna",
        },
      },
    };
    await store.saveCase(caseId, snapshot, browserOwner(ownedChatRequest({}, token)).hash);

    const response = await POST(ownedChatRequest({ message: "हाँ", caseId, caseSnapshot: snapshot }, token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.artifactDrafts["escalation-draft"].document.en.subject).toBe("Payment missing");
  });

  test("persists a structured citizen-reported desk response", async () => {
    resetMemoryStore();
    const caseId = crypto.randomUUID();
    const token = crypto.randomUUID();
    let snapshot = startCase("scholarship", "scholarship-v4");
    snapshot = applyCitizenReply(snapshot, "yes").caseSnapshot;
    snapshot = applyCitizenReply(snapshot, "yes").caseSnapshot;
    await store.saveCase(caseId, snapshot, browserOwner(ownedChatRequest({}, token)).hash);

    const response = await POST(ownedChatRequest({
      action: "record-desk-response",
      caseId,
      caseSnapshot: snapshot,
      locale: "en",
      deskResponse: {
        optionId: "npci-missing",
        response: "The PFMS desk reported that NPCI mapping was missing.",
        responseDate: "2026-09-05",
        referenceNumber: "PFMS-DEMO-44",
        evidence: "Fictional demo screenshot",
      },
    }, token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.reports[0]).toMatchObject({
      stepId: "pfms-trace",
      referenceNumber: "PFMS-DEMO-44",
      synthetic: true,
    });
    expect((await store.getCase(caseId))?.snapshot.reports?.[0]?.response)
      .toBe("The PFMS desk reported that NPCI mapping was missing.");
  });

  test("does not acknowledge a transition that failed to persist", async () => {
    delete process.env.OPENROUTER_API_KEY;
    resetMemoryStore();
    const caseId = crypto.randomUUID();
    const token = crypto.randomUUID();
    await store.saveCase(caseId, bereavement, browserOwner(ownedChatRequest({}, token)).hash);
    const saveCaseProgress = store.saveCaseProgress;
    store.saveCaseProgress = async () => { throw new Error("database offline"); };

    try {
      const response = await POST(ownedChatRequest(
        { message: "हाँ", caseId, caseSnapshot: bereavement },
        token,
      ));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "CASE_SAVE_FAILED" });
    } finally {
      store.saveCaseProgress = saveCaseProgress;
    }
  });

  test("a guessed case id cannot update another browser's journey", async () => {
    delete process.env.OPENROUTER_API_KEY;
    resetMemoryStore();
    const caseId = crypto.randomUUID();
    const ownerToken = crypto.randomUUID();
    await store.saveCase(caseId, bereavement, browserOwner(ownedChatRequest({}, ownerToken)).hash);

    const response = await POST(ownedChatRequest(
      { message: "हाँ", caseId, caseSnapshot: bereavement },
      crypto.randomUUID(),
    ));

    expect(response.status).toBe(404);
    expect((await store.getCase(caseId))?.snapshot).toEqual(bereavement);
  });

  test("runs a user-added workflow through the same validation and engine", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const spec: WorkflowSpec = {
      title: "Getting a ration card",
      steps: [{ title: "Check the documents", kind: "confirm" }],
    };
    registerWorkflowDefinition(compileWorkflow(spec, "custom-ration-card"));
    const snapshot = startCase("custom-ration-card");

    const response = await POST(
      chatRequest({ message: "हाँ", caseSnapshot: snapshot }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The confirm step completed and the closing node opened.
    expect(body.caseSnapshot.nodes[0].state).toBe("done");
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });

  test("rejects a snapshot naming a workflow that does not exist", async () => {
    const response = await POST(
      chatRequest({ message: "हाँ", caseSnapshot: { ...bereavement, workflowId: "invented" } }),
    );

    expect(response.status).toBe(400);
  });
});
