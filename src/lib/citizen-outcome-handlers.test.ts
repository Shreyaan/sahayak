import { describe, expect, test } from "bun:test";
import { createCitizenOutcomeHandlers } from "./citizen-outcome-handlers";

describe("citizen outcome HTTP boundary", () => {
  const caseId = "11111111-1111-4111-8111-111111111111";
  const ownerCookie = "sahayak-browser=22222222-2222-4222-8222-222222222222";

  test("rejects malformed feedback before recording evidence", async () => {
    let called = false;
    const handlers = createCitizenOutcomeHandlers({
      record: async () => { called = true; throw new Error("unexpected"); },
      list: async () => [],
    });

    const response = await handlers.record(new Request(`http://localhost/api/cases/${caseId}/outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify({ kind: "different", stepId: "step-1", detail: "x".repeat(501) }),
    }), caseId);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_OUTCOME", message: "Check the feedback and try again." } });
    expect(called).toBe(false);
  });

  test("returns stable errors when a step cannot receive feedback", async () => {
    const handlers = createCitizenOutcomeHandlers({
      record: async () => { throw new Error("STEP_NOT_REPORTABLE"); },
      list: async () => [],
    });

    const request = new Request(`http://localhost/api/cases/${caseId}/outcomes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "worked", stepId: "future-step" }),
    });
    request.headers.set("cookie", ownerCookie);
    expect(request.headers.get("cookie")).toBe(ownerCookie);
    const response = await handlers.record(request, caseId);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "STEP_NOT_REPORTABLE", message: "That step cannot receive feedback yet." } });
  });
});
