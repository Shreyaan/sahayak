import { afterEach, describe, expect, test } from "bun:test";
import { resetMemoryStore, store } from "@/lib/store";
import { GET, POST } from "./route";

afterEach(() => {
  resetMemoryStore();
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
  title: { hi: "मृत्यु दावे का मसौदा", en: "Bereavement claim draft" },
  steps: [{ hi: "Form 4 ले जाएँ", en: "Carry Form 4" }],
  matches: [],
  additions: [],
  conflicts: [],
  sourceType: "lived experience",
  corroborationCount: 1,
  status: "draft",
};

describe("/api/submissions", () => {
  test("saves a compiled draft for review", async () => {
    const response = await POST(postRequest({ input: "After my father died…", draft }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.saved).toBe(true);

    const stored = await store.listSubmissions(10);
    expect(stored).toHaveLength(1);
    expect(stored[0].input).toBe("After my father died…");
  });

  test("rejects a draft without the compiled shape", async () => {
    const response = await POST(postRequest({ input: "x", draft: { title: "nope" } }));

    expect(response.status).toBe(400);
  });

  test("lists recent submissions with a readable title", async () => {
    await POST(postRequest({ input: "After my father died…", draft }));

    const response = await GET();
    const body = await response.json();

    expect(body.submissions).toHaveLength(1);
    expect(body.submissions[0].title).toBe("Bereavement claim draft");
    expect(body.submissions[0].status).toBe("draft");
  });
});
