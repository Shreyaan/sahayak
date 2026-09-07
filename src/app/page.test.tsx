import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import common from "../../messages/en/common.json";
import citizen from "../../messages/en/citizen.json";
import pages from "../../messages/en/pages.json";
import { startCase, workflows, recordDeskReport } from "@/lib/workflow";
import Home, { transitionFeedback } from "./page";

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

function mockCaseApi(caseSnapshot = snapshot) {
  globalThis.fetch = mock((input: string | URL | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.pathname
          : new URL(input.url).pathname;

    if (url === `/api/cases/${caseId}`) {
      return Promise.resolve(
        response({
          case: { id: caseId, snapshot: caseSnapshot },
          definition: workflows.scholarship,
        })
      );
    }

    if (url === "/api/cases") {
      return Promise.resolve(
        response({
          cases: [
            {
              id: caseId,
              workflowId: "scholarship",
              snapshot: caseSnapshot,
              updatedAt: "2026-09-05T00:00:00.000Z",
            },
          ],
        })
      );
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
        <NuqsTestingAdapter
          searchParams={searchParams}
          onUrlUpdate={onUrlUpdate}
          hasMemory
        >
          <Home />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}

describe("citizen case continuity", () => {
  test("loads the exact browser-private case named in the URL", async () => {
    mockCaseApi();
    renderHome({ searchParams: `?caseId=${caseId}` });

    expect(
      await screen.findByRole("heading", { name: "Check where your scholarship payment is stuck" })
    ).not.toBeNull();
  });

  test("resuming a saved case records its id in the URL", async () => {
    mockCaseApi();
    const updates: UrlUpdateEvent[] = [];
    renderHome({ onUrlUpdate: (event) => updates.push(event) });

    fireEvent.click(
      await screen.findByRole("button", {
        name: /Stuck scholarship.*Continue case/s,
      })
    );

    await waitFor(() =>
      expect(updates.at(-1)?.searchParams.get("caseId")).toBe(caseId)
    );
  });

  test("retries the same saved case after a transient load failure", async () => {
    let detailAttempts = 0;
    globalThis.fetch = mock((input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.pathname
            : new URL(input.url).pathname;
      if (url === `/api/cases/${caseId}`) {
        detailAttempts += 1;
        return Promise.resolve(
          detailAttempts === 1
            ? response({ error: "Temporarily unavailable" }, 503)
            : response({
                case: { id: caseId, snapshot },
                definition: workflows.scholarship,
              })
        );
      }
      return Promise.resolve(
        response({
          cases: [
            {
              id: caseId,
              workflowId: "scholarship",
              snapshot,
              updatedAt: "2026-09-05T00:00:00.000Z",
            },
          ],
        })
      );
    }) as unknown as typeof fetch;

    renderHome({ searchParams: `?caseId=${caseId}` });
    expect(
      await screen.findByText(
        "No reply came through just now. Please try again."
      )
    ).not.toBeNull();
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Stuck scholarship.*Continue case/s,
      })
    );

    expect(
      await screen.findByRole("heading", { name: "Check where your scholarship payment is stuck" })
    ).not.toBeNull();
    expect(detailAttempts).toBe(2);
  });
});

describe("citizen action priority", () => {
  test("does not attach the previous step's success message to the next action", () => {
    const nextSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((node) =>
        node.id === "nsp-status"
          ? { ...node, state: "done" as const }
          : node.id === "pfms-trace"
            ? { ...node, state: "needs-you" as const }
            : node
      ),
    };

    expect(
      transitionFeedback(
        "The previous response was recorded.",
        "nsp-status",
        nextSnapshot
      )
    ).toBe("");
  });

  test("shows the current action before history without a simulated-time control", async () => {
    mockCaseApi();
    renderHome({ searchParams: `?caseId=${caseId}` });

    const actionHeading = await screen.findByRole("heading", {
      name: "Check where your scholarship payment is stuck",
    });
    const actionPanel = actionHeading.closest("section");
    // The journey history is the page's only ordered list; matched by structure so
    // the assertion survives styling changes.
    const timeline = document.querySelector("ol");

    expect(timeline?.closest("details")?.open).toBe(false);
    const reply = screen.queryByRole("textbox", { name: "Ask Sahayak a question" });
    expect(reply !== null).toBe(true);
    if (reply) {
      expect(actionPanel?.contains(reply)).toBe(true);
      expect(reply.closest("form")?.classList.contains("sticky")).toBe(false);
    }

    expect(actionPanel).not.toBeNull();
    expect(timeline).not.toBeNull();
    expect(
      actionPanel!.compareDocumentPosition(timeline!) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Move a day ahead" })
    ).toBeNull();
  });

  test("shows earned documents directly in the journey", async () => {
    mockCaseApi({
      ...snapshot,
      artifacts: ["npci-checklist", "escalation-draft"],
    });
    renderHome({ searchParams: `?caseId=${caseId}` });

    expect(
      await screen.findByRole("heading", { name: "Your documents" })
    ).not.toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Download bank seeding checklist" })
        .getAttribute("href")
    ).toBe(`/api/cases/${caseId}/artifacts/npci-checklist?locale=en`);
    expect(
      screen.getByRole("heading", { name: "Prepare your grievance" })
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Generate grievance with AI" })
    ).not.toBeNull();
  });
});

test("a citizen without a desk response sees preparation before being asked to fill a response", async () => {
  mockCaseApi({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      state:
        node.id === "pfms-trace"
          ? "needs-you"
          : node.id === "nsp-status"
            ? "done"
            : "pending",
    })),
  });
  renderHome({ searchParams: `?caseId=${caseId}` });
  const record = await screen.findByRole("button", {
    name: "I have a response to record",
  });
  expect(
    screen.queryByRole("textbox", { name: "What did they tell you?" }) === null
  ).toBe(true);
  expect(
    screen.getByText("Save or share this step") !== null
  ).toBe(true);
  fireEvent.click(record);
  expect(
    screen.getByRole("textbox", { name: "What did they tell you?" }) !== null
  ).toBe(true);
});

test("saved work points to the recovery action rather than the earlier blocker", async () => {
  mockCaseApi({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      state:
        node.id === "bank-seeding"
          ? "needs-you"
          : node.id === "pfms-trace"
            ? "blocked"
            : node.id === "nsp-status"
              ? "done"
              : "pending",
    })),
  });
  renderHome();
  expect(
    (await screen.findByRole("button", {
      name: /Stuck scholarship.*Next action: Request a bank seeding check/s,
    })) !== null
  ).toBe(true);
});

test("opening a saved case places keyboard focus on its current action", async () => {
  mockCaseApi();
  renderHome({ searchParams: `?caseId=${caseId}` });
  const heading = await screen.findByRole("heading", {
    name: "Check where your scholarship payment is stuck",
  });
  await waitFor(() => expect(document.activeElement === heading).toBe(true));
});

test("contributor mode keeps the wide layout even while a case is open", async () => {
  mockCaseApi();
  const { container } = renderHome({ searchParams: `?caseId=${caseId}` });
  await screen.findByRole("heading", { name: "Check where your scholarship payment is stuck" });

  // The narrow 520px column belongs to the citizen conversation only; the
  // contributor form and its MCP sidebar need the full width.
  expect(container.querySelector("main")?.className ?? "").not.toContain(
    "max-w-[1180px]"
  );
  fireEvent.click(screen.getByRole("button", { name: "Contribute" }));

  expect(container.querySelector("main")?.className ?? "").toContain(
    "max-w-[1180px]"
  );
});

test("the brand returns to the catalogue from an open case and clears its id from the URL", async () => {
  mockCaseApi();
  const updates: UrlUpdateEvent[] = [];
  renderHome({
    searchParams: `?caseId=${caseId}`,
    onUrlUpdate: (event) => updates.push(event),
  });
  await screen.findByRole("heading", { name: "Check where your scholarship payment is stuck" });

  fireEvent.click(screen.getByRole("button", { name: /^Sahayak/ }));

  expect(
    await screen.findByRole("heading", { name: "Government work stuck?" })
  ).not.toBeNull();
  await waitFor(() =>
    expect(updates.at(-1)?.searchParams.get("caseId")).toBeNull()
  );
});

test("the brand also leaves contributor mode", async () => {
  mockCaseApi();
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "Contribute" }));
  expect(
    screen.getByRole("heading", { name: /reviewable draft/ })
  ).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /^Sahayak/ }));

  expect(
    await screen.findByRole("heading", { name: "Government work stuck?" })
  ).not.toBeNull();
});

test("common questions use contextual help and leave the case on the same action", async () => {
  mockCaseApi();
  const original = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = mock((input: any, init?: RequestInit) => {
    if (input === "/api/chat") {
      sent = JSON.parse(String(init?.body));
      return Promise.resolve(response({ reply: "Ask your institution's scholarship desk for help.", caseSnapshot: snapshot }));
    }
    return original(input, init);
  }) as unknown as typeof fetch;
  renderHome({ searchParams: `?caseId=${caseId}` });
  fireEvent.click(await screen.findByRole("button", { name: "I don’t know my application ID" }));
  await screen.findByText("Ask your institution's scholarship desk for help.");
  expect(sent.action).toBe("help");
  expect(sent.message).toContain("application ID");
  expect(screen.getByRole("heading", { name: "Check where your scholarship payment is stuck" })).not.toBeNull();
});

test("a slow help reply cannot erase the next question being typed", async () => {
  mockCaseApi();
  const original = globalThis.fetch;
  let finish!: (response: Response) => void;
  globalThis.fetch = mock((input: string | URL | Request, init?: RequestInit) => input === "/api/chat"
    ? new Promise<Response>(resolve => { finish = resolve; }) : original(input, init)) as unknown as typeof fetch;
  renderHome({searchParams: `?caseId=${caseId}`});
  const input = await screen.findByRole("textbox", {name:"Ask Sahayak a question"});
  fireEvent.change(input, {target:{value:"What is PFMS?"}});
  fireEvent.click(screen.getByRole("button", {name:/^Ask$/}));
  fireEvent.change(input, {target:{value:"Where can I find my application ID?"}});
  finish(response({reply:"PFMS shows payment information.", caseSnapshot:snapshot}));
  await screen.findByText("PFMS shows payment information.");
  expect((input as HTMLTextAreaElement).value).toBe("Where can I find my application ID?");
});


test("a restored unmatched answer replaces the old payment instructions with paused guidance", async () => {
  const paused = recordDeskReport(startCase("scholarship"), {optionId: "different", response: "Scheme closed; come back in April", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  mockCaseApi(paused);
  renderHome({searchParams: `?caseId=${caseId}`});
  await screen.findByRole("heading", {name: "Review the answer you received"});
  expect(screen.queryByRole("link", {name: "Open PFMS payment tracker ↗"}) === null).toBe(true);
  expect(screen.getByText("Scheme closed; come back in April").textContent).toContain("April");
  fireEvent.click(screen.getByRole("button", {name: "Record a new answer or correction"}));
  expect(await screen.findByRole("textbox", {name: "What did they tell you?"})).toBeDefined();
});

test("bank recovery puts response entry before preparation and keeps documents expandable", async () => {
  const bank = recordDeskReport(startCase("scholarship"), {optionId: "npci-missing", response: "Demo: mapping issue", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  mockCaseApi(bank);
  renderHome({searchParams: `?caseId=${caseId}`});
  const record = await screen.findByRole("button", {name: "I have a response to record"});
  const office = screen.getByText("Your bank branch", {exact: true});
  expect(Boolean(record.compareDocumentPosition(office) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  const documents = screen.getByText("Documents and drafts · 1").closest("details")!;
  expect(documents.open).toBe(false);
  fireEvent.click(record);
  expect(await screen.findByRole("textbox", {name: "What did they tell you?"})).toBeDefined();
});


test("the grievance step directly opens its preparation form", async () => {
  const snapshot = startCase("scholarship");
  snapshot.nodes = snapshot.nodes.map(node => ({...node, state: node.id === "grievance" ? "needs-you" : "pending"}));
  snapshot.artifacts = ["escalation-draft"];
  mockCaseApi(snapshot);
  renderHome({searchParams: `?caseId=${caseId}`});
  const prepare = await screen.findByRole("button", {name: "Prepare my grievance"});
  const documents = screen.getByText("Documents and drafts · 1").closest("details")!;
  documents.scrollIntoView = () => {};
  expect(documents.open).toBe(false);
  fireEvent.click(prepare);
  expect(documents.open).toBe(true);
  expect(document.activeElement).toBe(documents.querySelector("summary"));
});
