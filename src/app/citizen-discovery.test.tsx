import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CitizenDiscovery } from "./citizen-discovery";

afterEach(() => {
  cleanup();
  mock.restore();
});

function renderDiscovery() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CitizenDiscovery locale="en" onStart={mock(() => Promise.resolve())} />
    </QueryClientProvider>,
  );
}

function safeResult() {
  return new Response(JSON.stringify({
    results: [{
      workflowVersionId: "scholarship-v1",
      title: "Stuck scholarship",
      summary: "Payment did not arrive",
      jurisdiction: { scope: "central" },
      matchReasons: ["Your words match this journey"],
      trust: {
        provenance: "official-source-reviewed",
        reviewDate: "2026-09-04",
        verificationMethod: "Seeded prototype guidance checked against public official sources.",
        currentExpertSupportCount: 0,
        hasUnresolvedDisagreement: false,
        sourceLinks: [{ label: "National Scholarships Portal", url: "https://scholarships.gov.in/" }],
      },
    }],
    shouldClarify: false,
    clarificationQuestion: null,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("CitizenDiscovery", () => {
  test("a changed problem cannot start the previous search result", async () => {
    globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
    renderDiscovery();
    const problem = screen.getByRole("textbox", { name: "Describe your problem" });
    fireEvent.change(problem, { target: { value: "scholarship payment stuck" } });
    fireEvent.click(screen.getByRole("button", { name: "Search journeys" }));
    await screen.findByRole("button", { name: "Start this journey" });
    fireEvent.change(problem, { target: { value: "driving licence renewal" } });
    expect(screen.queryByRole("button", { name: "Start this journey" }) === null).toBe(true);
  });

  test("shows an honest stop when no supported journey exists", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ results: [], shouldClarify: false, unsupported: true })))) as unknown as typeof fetch;
    renderDiscovery();
    fireEvent.change(screen.getByRole("textbox", { name: "Describe your problem" }), { target: { value: "driving licence renewal" } });
    fireEvent.click(screen.getByRole("button", { name: "Search journeys" }));
    await screen.findByText("We do not have a supported journey for this problem yet.");
    expect(screen.queryByRole("button", { name: "Start this journey" }) === null).toBe(true);
  });
  test("manual Search and Chat switching preserves the problem input", () => {
    renderDiscovery();

    const problem = screen.getByRole("textbox", { name: "Describe your problem" });
    fireEvent.change(problem, { target: { value: "My scholarship payment is stuck" } });
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.click(screen.getByRole("tab", { name: "Search" }));

    expect((problem as HTMLTextAreaElement).value).toBe("My scholarship payment is stuck");
  });

  test("an unsafe search automatically switches to Chat and asks one question", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      results: [],
      shouldClarify: true,
      clarificationQuestion: "Is this about a payment after a death or a scholarship payment?",
    }), { status: 200, headers: { "content-type": "application/json" } }))) as unknown as typeof fetch;

    renderDiscovery();
    fireEvent.change(screen.getByRole("textbox", { name: "Describe your problem" }), {
      target: { value: "My payment did not arrive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search journeys" }));

    await waitFor(() => expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByText("Is this about a payment after a death or a scholarship payment?")).not.toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  test("starts one case when the result button is clicked twice", async () => {
    globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
    let resolveStart!: () => void;
    const onStart = mock(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><CitizenDiscovery locale="en" onStart={onStart} /></QueryClientProvider>);
    fireEvent.change(screen.getByRole("textbox", { name: "Describe your problem" }), {
      target: { value: "scholarship payment stuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search journeys" }));
    const start = await screen.findByRole("button", { name: "Start this journey" });

    fireEvent.click(start);
    fireEvent.click(start);

    expect(onStart).toHaveBeenCalledTimes(1);
    await act(async () => resolveStart());
  });

  test("keeps trust details collapsed until a citizen chooses to inspect them", async () => {
    globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
    renderDiscovery();

    fireEvent.change(screen.getByRole("textbox", { name: "Describe your problem" }), {
      target: { value: "scholarship payment stuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search journeys" }));

    const disclosure = await screen.findByText("Why trust this?");
    const details = disclosure.closest("details");
    expect(details?.open).toBe(false);
    expect(screen.getByRole("link", { name: "National Scholarships Portal" }).getAttribute("href"))
      .toBe("https://scholarships.gov.in/");
    expect(screen.getByText("Current expert supports")).not.toBeNull();
  });
});
