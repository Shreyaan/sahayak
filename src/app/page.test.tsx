import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import common from "../../messages/en/common.json";
import citizen from "../../messages/en/citizen.json";
import pages from "../../messages/en/pages.json";
import { startCase, workflows } from "@/lib/workflow";
import Home from "./page";

const caseId = "11111111-1111-4111-8111-111111111111";
const snapshot = startCase("scholarship");

afterEach(() => {
  cleanup();
  mock.restore();
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockCaseApi() {
  globalThis.fetch = mock((input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;

    if (url === `/api/cases/${caseId}`) {
      return Promise.resolve(response({
        case: { id: caseId, snapshot },
        definition: workflows.scholarship,
      }));
    }

    if (url === "/api/cases") {
      return Promise.resolve(response({
        cases: [{ id: caseId, workflowId: "scholarship", snapshot, updatedAt: "2026-09-05T00:00:00.000Z" }],
      }));
    }

    return Promise.resolve(response({ error: "Unexpected request" }, 500));
  }) as unknown as typeof fetch;
}

function renderHome({
  searchParams = "",
  onUrlUpdate,
}: {
  searchParams?: string;
  onUrlUpdate?: (event: UrlUpdateEvent) => void;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <NextIntlClientProvider locale="en" messages={{ common, citizen, pages }}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter searchParams={searchParams} onUrlUpdate={onUrlUpdate} hasMemory>
          <Home />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe("citizen case continuity", () => {
  test("loads the exact browser-private case named in the URL", async () => {
    mockCaseApi();
    renderHome({ searchParams: `?caseId=${caseId}` });

    expect(await screen.findByRole("heading", { name: "Understand the NSP status" })).not.toBeNull();
    expect(screen.getByText("Day 0")).not.toBeNull();
  });

  test("resuming a saved case records its id in the URL", async () => {
    mockCaseApi();
    const updates: UrlUpdateEvent[] = [];
    renderHome({ onUrlUpdate: (event) => updates.push(event) });

    fireEvent.click(await screen.findByRole("button", { name: /Stuck scholarship.*Continue case/s }));

    await waitFor(() => expect(updates.at(-1)?.searchParams.get("caseId")).toBe(caseId));
  });

  test("retries the same saved case after a transient load failure", async () => {
    let detailAttempts = 0;
    globalThis.fetch = mock((input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
      if (url === `/api/cases/${caseId}`) {
        detailAttempts += 1;
        return Promise.resolve(detailAttempts === 1
          ? response({ error: "Temporarily unavailable" }, 503)
          : response({ case: { id: caseId, snapshot }, definition: workflows.scholarship }));
      }
      return Promise.resolve(response({
        cases: [{ id: caseId, workflowId: "scholarship", snapshot, updatedAt: "2026-09-05T00:00:00.000Z" }],
      }));
    }) as unknown as typeof fetch;

    renderHome({ searchParams: `?caseId=${caseId}` });
    expect(await screen.findByText("No reply came through just now. Please try again.")).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Stuck scholarship.*Continue case/s }));

    expect(await screen.findByRole("heading", { name: "Understand the NSP status" })).not.toBeNull();
    expect(detailAttempts).toBe(2);
  });
});

describe("citizen action priority", () => {
  test("shows the current action before history and disables idle demo time", async () => {
    mockCaseApi();
    renderHome({ searchParams: `?caseId=${caseId}` });

    const actionHeading = await screen.findByRole("heading", { name: "Understand the NSP status" });
    const actionPanel = actionHeading.closest("section");
    const timeline = document.querySelector("ol.timeline");

    expect(actionPanel).not.toBeNull();
    expect(timeline).not.toBeNull();
    expect(actionPanel!.compareDocumentPosition(timeline!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move a day ahead" }).hasAttribute("disabled")).toBe(true);
  });
});
