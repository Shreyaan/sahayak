import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { resetMemoryStore, store } from "@/lib/store";
import { GET, POST } from "./route";

afterEach(() => {
  resetMemoryStore();
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

describe("/api/cases", () => {
  beforeAll(async () => {
    await seedPublishedWorkflows();
  });

  test("opens a persisted case for a bundled journey", async () => {
    const response = await POST(postRequest({ workflowVersionId: "scholarship-v1" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.caseId).toBeString();
    expect(body.caseSnapshot.nodes[0].state).toBe("needs-you");
    expect(body.saved).toBeUndefined();
    expect(body.outcomeTracked).toBeUndefined();

    const cases = await store.listCases(10);
    expect(cases.map((entry) => entry.id)).toContain(body.caseId);
  });

  test("rejects an unknown journey", async () => {
    const response = await POST(postRequest({ workflowVersionId: "invented-journey-v1" }));

    expect(response.status).toBe(404);
  });

  test("lists cases only for the browser that started them", async () => {
    const started = await POST(postRequest({ workflowVersionId: "scholarship-v1" }));
    const ownerCookie = started.headers.get("set-cookie")?.split(";", 1)[0];
    expect(ownerCookie).toStartWith("sahayak-browser=");

    const returningRequest = new Request("http://localhost/api/cases");
    returningRequest.headers.set("cookie", ownerCookie!);
    const response = await GET(returningRequest);
    const body = await response.json();

    expect(body.cases).toHaveLength(1);
    expect(body.cases[0].snapshot.workflowId).toBe("scholarship");

    const otherRequest = new Request("http://localhost/api/cases");
    otherRequest.headers.set("cookie", `sahayak-browser=${crypto.randomUUID()}`);
    const otherBrowser = await GET(otherRequest);
    expect((await otherBrowser.json()).cases).toEqual([]);
  });
});
