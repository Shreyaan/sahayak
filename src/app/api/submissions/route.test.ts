import { afterEach, describe, expect, test } from "bun:test";
import { resetTestReviewCases } from "@/lib/review-case-repository";
import { signContributionPreview } from "@/lib/contribution-preview";
import { workflows } from "@/lib/workflow";
import { POST } from "./route";

afterEach(() => {
  resetTestReviewCases();
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/submissions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

const draft = {
  workflowId: "bereavement",
  definition: structuredClone(workflows.bereavement),
  title: { hi: "मृत्यु दावे का मसौदा", en: "Bereavement claim draft" },
  summary: { hi: "एक समीक्षा सार", en: "A review summary" },
  steps: [{ hi: "Form 4 ले जाएँ", en: "Carry Form 4" }],
  matches: [],
  additions: [],
  conflicts: [],
  sourceType: "lived experience" as const,
  corroborationCount: 1,
  status: "draft",
};

describe("/api/submissions", () => {
  test("creates a confirmed review case and returns its exact protected link", async () => {
    const response = await POST(postRequest({
      confirmed: true,
      previewToken: signContributionPreview({ input: "After my father died…", jurisdiction: { scope: "state", stateCode: "UP" }, draft: {
        workflowId: draft.workflowId, definition: draft.definition, title: draft.title, summary: draft.summary, steps: draft.steps, matches: draft.matches, additions: draft.additions, conflicts: draft.conflicts, sourceType: draft.sourceType,
      } }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.reviewCaseId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.reviewUrl).toBe(`/admin/reviews/${body.reviewCaseId}`);
  });

  test("returns a stable error when confirmation or jurisdiction is missing", async () => {
    const response = await POST(postRequest({ confirmed: true, previewToken: "tampered.preview" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: { code: "INVALID_PREVIEW_TOKEN", message: "Preview the contribution again before submitting." } });
  });
});
