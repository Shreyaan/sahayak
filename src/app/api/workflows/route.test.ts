import { afterEach, describe, expect, test } from "bun:test";
import { resetMemoryStore, store } from "@/lib/store";
import { compileWorkflow, type WorkflowSpec } from "@/lib/custom-workflow";
import { GET, POST } from "./route";

const originalKey = process.env.OPENROUTER_API_KEY;

afterEach(() => {
  process.env.OPENROUTER_API_KEY = originalKey;
  resetMemoryStore();
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/workflows", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

const spec: WorkflowSpec = {
  title: "Getting a ration card",
  steps: [
    { title: "Check the documents", kind: "confirm" },
    { title: "Submit at the office", kind: "visit" },
    { title: "Verification", kind: "desk" },
  ],
};

describe("/api/workflows", () => {
  test("lists the bundled journeys without any custom ones", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual(["bereavement", "scholarship"]);
  });

  test("compiles, registers, and persists a user-added workflow", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(postRequest(spec));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.saved).toBe(true);
    expect(body.definition.id).toBe("custom-getting-a-ration-card");
    expect(body.definition.nodes.at(-1).type).toBe("case-complete");

    const list = await GET();
    const listBody = await list.json();
    expect(listBody.workflows.map((w: { id: string }) => w.id)).toContain("custom-getting-a-ration-card");

    const stored = await store.listWorkflows();
    expect(stored.map((row) => row.id)).toContain("custom-getting-a-ration-card");
  });

  test("rejects a workflow without steps", async () => {
    const response = await POST(postRequest({ title: "No steps", steps: [] }));

    expect(response.status).toBe(400);
  });

  test("rejects an unnamed workflow", async () => {
    const response = await POST(postRequest({ title: "ab", steps: [{ title: "x", kind: "confirm" }] }));

    expect(response.status).toBe(400);
  });

  test("keeps the compiled definition when the model is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const response = await POST(postRequest(spec));
    const body = await response.json();
    const compiled = compileWorkflow(spec, body.definition.id);

    expect(body.definition.title).toEqual(compiled.title);
  });
});
