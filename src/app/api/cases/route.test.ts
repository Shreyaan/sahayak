import { afterEach, describe, expect, test } from "bun:test";
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
  test("opens a persisted case for a bundled journey", async () => {
    const response = await POST(postRequest({ workflowId: "bereavement" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.caseId).toBeString();
    expect(body.caseSnapshot.nodes[0].state).toBe("needs-you");
    expect(body.saved).toBe(true);

    const cases = await store.listCases(10);
    expect(cases.map((entry) => entry.id)).toContain(body.caseId);
  });

  test("rejects an unknown journey", async () => {
    const response = await POST(postRequest({ workflowId: "invented-journey" }));

    expect(response.status).toBe(400);
  });

  test("lists recent cases for the returning citizen", async () => {
    await POST(postRequest({ workflowId: "scholarship" }));

    const response = await GET();
    const body = await response.json();

    expect(body.cases).toHaveLength(1);
    expect(body.cases[0].snapshot.workflowId).toBe("scholarship");
  });
});
