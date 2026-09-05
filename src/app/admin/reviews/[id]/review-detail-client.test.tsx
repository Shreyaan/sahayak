import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { workflows } from "@/lib/workflow";
import type { ReviewCaseDetail } from "@/lib/review-case-service";
import { ReviewDetailClient } from "./review-detail-client";

const review = {
  id: "c1b41a60-0b53-412f-8902-a8f22da89387", sourceChannel: "contributor", status: "draft", submittedTitle: "Scholarship payment missing", evidence: "redacted", jurisdiction: { scope: "central" }, baselineWorkflowVersionId: null,
  currentRevision: { id: "revision-1", revision: 1, contentHash: "a".repeat(64), content: { workflowId: "scholarship", definition: structuredClone(workflows.scholarship), title: structuredClone(workflows.scholarship.title), summary: structuredClone(workflows.scholarship.subtitle), steps: workflows.scholarship.nodes.map((node) => structuredClone(node.title)), matches: [], additions: [], conflicts: [], sourceType: "lived experience" as const }, createdAt: "2026-09-05T00:00:00.000Z", editorId: null },
  createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z",
  similar: [{ workflowId: "scholarship", workflowVersionId: "scholarship-v1", title: "Stuck scholarship", summary: "Payment delayed", jurisdiction: { scope: "central" }, matchReasons: [], trust: { provenance: "official-source-reviewed", reviewDate: "2026-09-04", verificationMethod: "seed", currentExpertSupportCount: 0, hasUnresolvedDisagreement: false, sourceLinks: [] } }],
  baseline: null, comparison: [], trustPreview: { status: "pending expert review" as const, sourceType: "lived experience" as const, jurisdiction: { scope: "central" as const }, expertSupportCount: 0 as const },
} satisfies ReviewCaseDetail;

afterEach(() => { cleanup(); mock.restore(); });

describe("ReviewDetailClient", () => {
  test("selecting a baseline issues the protected mutation and refreshes the detail query", async () => {
    const calls: Array<{ method?: string; body?: string }> = [];
    globalThis.fetch = mock((_url: string, init?: RequestInit) => {
      calls.push({ method: init?.method, body: init?.body as string | undefined });
      return Promise.resolve(new Response(JSON.stringify({ review }), { status: 200 }));
    }) as unknown as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><ReviewDetailClient reviewId={review.id} initialReview={review} /></QueryClientProvider>);

    fireEvent.change(screen.getByLabelText("Baseline"), { target: { value: "scholarship-v1" } });
    await waitFor(() => expect(calls.some((call) => call.method === "PATCH" && call.body?.includes('"action":"select-baseline"'))).toBe(true));
  });
});
