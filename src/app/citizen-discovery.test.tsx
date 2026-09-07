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
    const problem = screen.getByRole("textbox", { name: "What do you need help with?" });
    fireEvent.change(problem, { target: { value: "scholarship payment stuck" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByRole("button", { name: "Start this journey" });
    fireEvent.change(problem, { target: { value: "driving licence renewal" } });
    expect(screen.queryByRole("button", { name: "Start this journey" }) === null).toBe(true);
  });

  test("shows an honest stop when no supported journey exists", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ results: [], shouldClarify: false, unsupported: true })))) as unknown as typeof fetch;
    renderDiscovery();
    fireEvent.change(screen.getByRole("textbox", { name: "What do you need help with?" }), { target: { value: "driving licence renewal" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Sorry — Sahayak can't help with this one right now.");
    expect(screen.queryByRole("button", { name: "Start this journey" }) === null).toBe(true);
  });
  test("discovery has one search with no mode choice", () => {
    renderDiscovery();

    const problem = screen.getByRole("textbox", { name: "What do you need help with?" });
    fireEvent.change(problem, { target: { value: "My scholarship payment is stuck" } });
    expect(screen.queryByRole("tablist") === null).toBe(true);
    expect(screen.getByRole("button", {name: "Search"})).toBeTruthy();

    expect((problem as HTMLTextAreaElement).value).toBe("My scholarship payment is stuck");
  });

  test("an ambiguous search asks a clarification beneath the original query", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({
      results: [],
      shouldClarify: true,
      clarificationQuestion: "Is this about a payment after a death or a scholarship payment?",
    }), { status: 200, headers: { "content-type": "application/json" } }))) as unknown as typeof fetch;

    renderDiscovery();
    fireEvent.change(screen.getByRole("textbox", { name: "What do you need help with?" }), {
      target: { value: "My payment did not arrive" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByRole("textbox", {name: "Your answer"});
    expect((screen.getByRole("textbox", {name: "What do you need help with?"}) as HTMLTextAreaElement).value).toBe("My payment did not arrive");
    expect(screen.getByText("Is this about a payment after a death or a scholarship payment?")).not.toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    let submitted: Record<string, unknown> | undefined;
    globalThis.fetch = mock((_url: unknown, options: RequestInit) => {
      submitted = JSON.parse(String(options.body));
      return Promise.resolve(safeResult());
    }) as unknown as typeof fetch;
    fireEvent.change(screen.getByRole("textbox", {name: "Your answer"}), {target: {value: "Scholarship payment"}});
    fireEvent.click(screen.getByRole("button", {name: "Search"}));
    await screen.findByRole("button", {name: "Start this journey"});
    expect(submitted).toMatchObject({query: "My payment did not arrive. Scholarship payment", clarificationAttempt: 1});

  });

  test("starts one case when the result button is clicked twice", async () => {
    globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
    let resolveStart!: () => void;
    const onStart = mock(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><CitizenDiscovery locale="en" onStart={onStart} /></QueryClientProvider>);
    fireEvent.change(screen.getByRole("textbox", { name: "What do you need help with?" }), {
      target: { value: "scholarship payment stuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const start = await screen.findByRole("button", { name: "Start this journey" });

    fireEvent.click(start);
    fireEvent.click(start);

    expect(onStart).toHaveBeenCalledTimes(1);
    await act(async () => resolveStart());
  });

  test("keeps trust details collapsed until a citizen chooses to inspect them", async () => {
    globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
    renderDiscovery();

    fireEvent.change(screen.getByRole("textbox", { name: "What do you need help with?" }), {
      target: { value: "scholarship payment stuck" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    const disclosure = await screen.findByText("Why trust this?");
    const details = disclosure.closest("details");
    expect(details?.open).toBe(false);
    expect(screen.getByRole("link", { name: "National Scholarships Portal" }).getAttribute("href"))
      .toBe("https://scholarships.gov.in/");
    expect(screen.getByText("Current expert supports")).not.toBeNull();
  });
});

test("a plain-language starter searches without silently creating a case", async () => {
  globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
  renderDiscovery();
  fireEvent.click(screen.getByRole("button", { name: "Scholarship money hasn’t arrived" }));
  await screen.findByRole("button", { name: "Start this journey" });
  expect((screen.getByRole("textbox", { name: "What do you need help with?" }) as HTMLTextAreaElement).value.toLowerCase()).toContain("scholarship");
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test("changing jurisdiction removes an old match while keeping the citizen's words", async () => {
  globalThis.fetch = mock(() => Promise.resolve(safeResult())) as unknown as typeof fetch;
  const queryClient = new QueryClient({defaultOptions: {mutations: {retry: false}}});
  const onStart = mock(() => Promise.resolve());
  const view = (stateCode: string) => <QueryClientProvider client={queryClient}><CitizenDiscovery locale="en" stateCode={stateCode} onStart={onStart} /></QueryClientProvider>;
  const {rerender} = render(view("PB"));
  fireEvent.change(screen.getByRole("textbox", {name: "What do you need help with?"}), {target: {value:"income certificate pending"}});
  fireEvent.click(screen.getByRole("button", {name:"Search"}));
  await screen.findByRole("button", {name:"Start this journey"});
  rerender(view("NL"));
  expect(screen.queryByRole("button", {name:"Start this journey"}) === null).toBe(true);
  expect((screen.getByRole("textbox", {name:"What do you need help with?"}) as HTMLTextAreaElement).value).toBe("income certificate pending");
});

test("an unconfirmed retrieval result requires explicit citizen confirmation", async () => {
  const body = await safeResult().json();
  body.results[0].requiresConfirmation = true;
  globalThis.fetch = mock(() => Promise.resolve(Response.json(body))) as unknown as typeof fetch;
  renderDiscovery();
  fireEvent.change(screen.getByRole("textbox", {name: "What do you need help with?"}), {target: {value: "scholarship"}});
  fireEvent.click(screen.getByRole("button", {name: "Search"}));
  const start = await screen.findByRole("button", {name: "Start this journey"}) as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", {name: "Yes, this describes my situation"}));
  expect(start.disabled).toBe(false);
});
