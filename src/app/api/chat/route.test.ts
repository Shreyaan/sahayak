import { afterEach, describe, expect, mock, test } from "bun:test";
import { resetMemoryStore, store } from "@/lib/store";
import { compileGeneratedContribution } from "@/lib/contribution";
import { applyIntent, registerWorkflowDefinition, startCase, recordDeskReport } from "@/lib/workflow";
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
  test("contextual help receives the workflow, prior conversation and redacted question without advancing", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    let captured: Record<string, unknown> = {};
    mock.module("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: () => () => ({ modelId: "test" }) }));
    mock.module("ai", () => ({ generateText: async (input: Record<string, unknown>) => { captured = input; return { text: "PFMS shows payment information. Use the official tracker above." }; } }));
    const snapshot = startCase("scholarship");
    const result = await POST(chatRequest({ action: "help", message: "yes, explain PFMS for citizen@example.com", locale: "en", caseSnapshot: snapshot, conversation: [{ role: "user", content: "Where do I check?" }] }));
    const body = await result.json();
    expect(body.aiGenerated).toBe(true);
    expect(body.caseSnapshot).toEqual(snapshot);
    expect(String(captured.prompt)).toContain("pfms-trace");
    expect(String(captured.prompt)).toContain("Where do I check?");
    expect(String(captured.prompt)).not.toContain("citizen@example.com");
    expect(String(captured.instructions)).toContain("do not change case progress");
    expect(captured.timeout).toBe(15_000);
  });
  test("help questions never turn yes into a case transition when AI is unavailable", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const snapshot = startCase("scholarship");
    const result = await POST(chatRequest({ action: "help", message: "yes, but what is PFMS?", locale: "en", caseSnapshot: snapshot }));
    const body = await result.json();
    expect(result.status).toBe(200);
    expect(body.caseSnapshot).toEqual(snapshot);
    expect(body.aiGenerated).toBe(false);
    expect(body.reply).toContain("unavailable");
    expect(body.reply).toContain("scholarship desk");
    expect(body.reply).toContain("NSP shows released");
  });
  test("a stale confirmation cannot answer the next step in another tab", async () => {
    resetMemoryStore();
    const token = crypto.randomUUID();
    const owner = browserOwner(ownedChatRequest({}, token));
    const fresh = startCase("bereavement");
    const advanced = applyIntent(fresh, "affirmative").caseSnapshot;
    await store.saveCase("stale-tab-case", advanced, owner.hash);
    const response = await POST(ownedChatRequest({ caseId: "stale-tab-case", caseSnapshot: fresh, action: "reply", intent: "affirmative" }, token));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("CASE_CONFLICT");
    expect((await store.getCase("stale-tab-case", owner.hash))?.snapshot).toEqual(advanced);
  });
  test("uses the deterministic path when OpenRouter is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(
      chatRequest({ action: "reply", intent: "affirmative", caseSnapshot: bereavement }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });

  test("rejects client requests to advance simulated time", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mock.module("ai", () => ({ generateText: async () => { throw new Error("must not call provider for explicit actions"); } }));

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

    const response = await POST(chatRequest({ action: "reply", intent: "affirmative", caseSnapshot }));

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
    mock.module("ai", () => ({ generateText: async () => { throw new Error("must not call provider for explicit actions"); } }));

    const response = await POST(chatRequest({ action: "reply", intent: "affirmative", caseSnapshot: bereavement }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reply).toBe("ठीक है। अब नाम मिलान करते हैं।");
    expect(body.caseSnapshot.nodes[0].state).toBe("done");
  });

  test("answers in the requested language", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const hindi = await (await POST(
      chatRequest({ action: "reply", intent: "affirmative", locale: "hi", caseSnapshot: bereavement }),
    )).json();
    const english = await (await POST(
      chatRequest({ action: "reply", intent: "affirmative", locale: "en", caseSnapshot: bereavement }),
    )).json();

    expect(hindi.reply).toBe("ठीक है। अब नाम मिलान करते हैं।");
    expect(typeof english.reply).toBe("string");
    expect(english.reply).not.toBe(hindi.reply);
    expect(/[\u0900-\u097F]/.test(english.reply)).toBe(false);
    // The same deterministic transition happens either way.
    expect(english.caseSnapshot).toEqual(hindi.caseSnapshot);
  });

  test("rejects an unsupported locale", async () => {
    const response = await POST(
      chatRequest({ action: "reply", intent: "affirmative", locale: "fr", caseSnapshot: bereavement }),
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
      ownedChatRequest({ action: "reply", intent: "affirmative", caseId, caseSnapshot: bereavement }, token),
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
      ...startCase("scholarship", "scholarship-v6"),
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

    const response = await POST(ownedChatRequest({ action: "reply", intent: "affirmative", caseId, caseSnapshot: snapshot }, token));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.caseSnapshot.artifactDrafts["escalation-draft"].document.en.subject).toBe("Payment missing");
  });

  test("persists a structured citizen-reported desk response", async () => {
    resetMemoryStore();
    const caseId = crypto.randomUUID();
    const token = crypto.randomUUID();
    let snapshot = startCase("scholarship", "scholarship-v6");
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
        { action: "reply", intent: "affirmative", caseId, caseSnapshot: bereavement },
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
      { action: "reply", intent: "affirmative", caseId, caseSnapshot: bereavement },
      crypto.randomUUID(),
    ));

    expect(response.status).toBe(404);
    expect((await store.getCase(caseId))?.snapshot).toEqual(bereavement);
  });

  test("runs a user-added workflow through the same validation and engine", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const { definition } = compileGeneratedContribution({
      title: {en: "Getting a ration card", hi: "राशन कार्ड"},
      summary: {en: "Check documents", hi: "दस्तावेज़ जाँचें"},
      steps: [{title: {en: "Check documents", hi: "दस्तावेज़ जाँचें"}, detail: {en: "Check your list", hi: "सूची जाँचें"}, ask: {en: "Checked?", hi: "जाँच लिया?"}, kind: "confirm"}],
      reviewFlags: [], jurisdiction: {scope: "central", reason: {en: "Test", hi: "परीक्षण"}},
    });
    registerWorkflowDefinition(definition);
    const snapshot = startCase(definition.id);

    const response = await POST(
      chatRequest({ action: "reply", intent: "affirmative", caseSnapshot: snapshot }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // The confirm step completed and the closing node opened.
    expect(body.caseSnapshot.nodes[0].state).toBe("done");
    expect(body.caseSnapshot.nodes[1].state).toBe("needs-you");
  });

  test("rejects a snapshot naming a workflow that does not exist", async () => {
    const response = await POST(
      chatRequest({ action: "reply", intent: "affirmative", caseSnapshot: { ...bereavement, workflowId: "invented" } }),
    );

    expect(response.status).toBe(400);
  });
});


test("paused guidance gives AI the actual answer without the obsolete payment instructions", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  let prompt = "";
  mock.module("@openrouter/ai-sdk-provider", () => ({createOpenRouter: () => () => ({modelId: "test"})}));
  mock.module("ai", () => ({generateText: async (input: {prompt: string}) => {prompt = input.prompt; return {output: {explanation: "The desk told you to return in April, which is unverified.", question: "Did they mean new applications or your existing payment?", nextQuestion: "Does the closure apply to my existing payment?", supportedOptionId: null}};}}));
  const paused = recordDeskReport(startCase("scholarship"), {optionId: "different", response: "Scheme closed; return in April", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  const result = await POST(chatRequest({action: "help", message: "What does their answer mean?", locale: "en", caseSnapshot: paused}));
  const body = await result.json();
  expect(body.caseSnapshot).toEqual(paused);
  const context = JSON.parse(prompt);
  expect(context.response).toContain("April");
  expect(prompt).not.toContain("Open PFMS");
  expect(body.clarification.question).toContain("existing payment");
  expect(body.aiGenerated).toBe(true);
  const followup = await POST(chatRequest({action: "help", message: "I do not know", locale: "en", caseSnapshot: paused, conversation: [{role: "assistant", content: body.reply}]}));
  const followed = await followup.json();
  expect(followed.clarification.question).toBeNull();
  expect(followed.caseSnapshot).toEqual(paused);
});


test("clarification notes persist separately and stale report notes are refused", async () => {
  resetMemoryStore();
  const caseId = crypto.randomUUID(); const token = crypto.randomUUID();
  const owner = browserOwner(ownedChatRequest({}, token)).hash;
  const paused = recordDeskReport(startCase("scholarship", "scholarship-v6"), {optionId: "different", response: "Scheme closed; return in April", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  await store.saveCase(caseId, paused, owner);
  const input = {action: "save-clarification", caseId, caseSnapshot: paused, locale: "en", message: "Does this concern my existing payment?", reportRecordedAt: paused.reports![0].recordedAt};
  const response = await POST(ownedChatRequest(input, token));
  expect(response.status).toBe(200);
  const saved = (await store.getCase(caseId, owner))!.snapshot;
  expect(saved.clarificationNotes?.[0].text).toContain("existing payment");
  expect(saved.nodes).toEqual(paused.nodes);
  expect(saved.reports).toEqual(paused.reports);
  expect(saved.workflowVersionId).toBe(paused.workflowVersionId);
  const stale = await POST(ownedChatRequest({...input, reportRecordedAt: "2026-09-07T10:00:00Z"}, token));
  expect(stale.status).toBe(409);
  const other = await POST(ownedChatRequest(input, crypto.randomUUID()));
  expect(other.status).toBe(404);
});

test("paused interpretation rejects invented options and falls back without progressing", async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  mock.module("ai", () => ({generateText: async () => ({output: {explanation: "Go now", question: null, nextQuestion: "Where?", supportedOptionId: "invented"}})}));
  const paused = recordDeskReport(startCase("scholarship"), {optionId: "different", response: "Something else", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  const response = await POST(chatRequest({action: "help", message: "Explain", locale: "hi", caseSnapshot: paused}));
  const body = await response.json();
  expect(body.aiGenerated).toBe(false);
  expect(body.clarification.supportedOptionId).toBeNull();
  expect(body.clarification.nextQuestion).toContain("मौजूदा");
  expect(body.caseSnapshot).toEqual(paused);
});
