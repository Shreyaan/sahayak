import { describe, expect, test } from "bun:test";
import type { ReviewCase } from "@/lib/review-case-service";
import { workflows } from "@/lib/workflow";
import { createReviewHandlers } from "./review-handlers";

const review = {
  id: "c1b41a60-0b53-412f-8902-a8f22da89387", sourceChannel: "contributor", status: "draft", submittedTitle: null, evidence: "redacted", jurisdiction: { scope: "central" },
  baselineWorkflowVersionId: null,
  currentRevision: { id: "revision-1", revision: 1, contentHash: "a".repeat(64), content: { workflowId: "scholarship", definition: structuredClone(workflows.scholarship), title: { hi: "मसौदा", en: "Draft" }, summary: { hi: "सार", en: "Summary" }, steps: [{ hi: "कदम", en: "Step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience" }, createdAt: "2026-09-05T00:00:00.000Z", editorId: null },
  createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z",
} satisfies ReviewCase;

describe("review admin API boundary", () => {
  test("returns a stable unauthenticated error", async () => {
    const handlers = createReviewHandlers({ requireExpert: async () => { throw new Error("AUTH_REQUIRED"); }, list: async () => [], get: async () => null });
    const response = await handlers.list(new Request("http://localhost/api/admin/reviews"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: "AUTH_REQUIRED", message: "Please sign in." } });
  });

  test("authenticates before validating malformed protected input", async () => {
    const handlers = createReviewHandlers({ requireExpert: async () => { throw new Error("AUTH_REQUIRED"); }, list: async () => [], get: async () => null });
    expect((await handlers.list(new Request("http://localhost/api/admin/reviews?status=nope"))).status).toBe(401);
    expect((await handlers.detail(new Request("http://localhost"), "not-a-uuid")).status).toBe(401);
  });

  test("returns a clear forbidden error for a signed-in non-expert", async () => {
    const handlers = createReviewHandlers({ requireExpert: async () => { throw new Error("EXPERT_REQUIRED"); }, list: async () => [], get: async () => null });
    const response = await handlers.list(new Request("http://localhost/api/admin/reviews"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "EXPERT_REQUIRED", message: "Verified expert access is required." } });
  });

  test("rejects an invalid queue filter before querying cases", async () => {
    const handlers = createReviewHandlers({ requireExpert: async () => ({ userId: "expert" }), list: async () => [review], get: async () => review });
    const response = await handlers.list(new Request("http://localhost/api/admin/reviews?status=nope"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: { code: "INVALID_FILTER", message: "Choose a valid review status and jurisdiction." } });
  });

  test("returns the exact protected detail and a not-found boundary error", async () => {
    const handlers = createReviewHandlers({ requireExpert: async () => ({ userId: "expert" }), list: async () => [review], get: async (id) => id === review.id ? review : null });
    expect((await handlers.detail(new Request("http://localhost"), review.id)).status).toBe(200);
    const missing = await handlers.detail(new Request("http://localhost"), "c1b41a60-0b53-412f-8902-a8f22da89388");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: { code: "REVIEW_CASE_NOT_FOUND", message: "That review case was not found." } });
  });

  test("authenticates before a wording mutation and returns stable stale errors", async () => {
    const handlers = createReviewHandlers({
      requireExpert: async () => ({ userId: "expert" }), list: async () => [review], get: async () => review,
      saveWording: async () => { throw new Error("STALE_REVISION"); }, selectBaseline: async () => review,
    } as any);
    const response = await (handlers as any).patch(new Request("http://localhost", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
        action: "save-wording", expectedHash: "a".repeat(64), wording: {
          title: review.currentRevision.content.definition.title, subtitle: review.currentRevision.content.definition.subtitle,
          nodes: review.currentRevision.content.definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })),
        },
      }),
    }), review.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "STALE_REVISION", message: "This review changed. Reload it before saving." } });
  });

  test("selects a published baseline or no baseline without touching revision content", async () => {
    const selections: Array<string | null> = [];
    const handlers = createReviewHandlers({
      requireExpert: async () => ({ userId: "expert" }), list: async () => [review], get: async () => review,
      saveWording: async () => review,
      selectBaseline: async ({ baselineWorkflowVersionId }) => { selections.push(baselineWorkflowVersionId); return { ...review, baselineWorkflowVersionId }; },
    });
    for (const baselineWorkflowVersionId of ["scholarship-v1", null]) {
      const response = await handlers.patch(new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "select-baseline", baselineWorkflowVersionId }) }), review.id);
      expect(response.status).toBe(200);
    }
    expect(selections).toEqual(["scholarship-v1", null]);
  });
});
