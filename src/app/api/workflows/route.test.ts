import { describe, expect, test } from "bun:test";
import { GET, POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/workflows", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

describe("/api/workflows", () => {
  test("lists the bundled journeys without any custom ones", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.workflows.map((w: { id: string }) => w.id)).toEqual(["aadhaar-update", "bereavement", "epfo-claim", "scholarship"]);
  });

  test("retires direct custom workflow submission so it cannot reach citizen discovery", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body).toEqual({ error: { code: "WORKFLOW_SUBMISSION_RETIRED", message: "Submit a lived experience for expert review instead." } });
  });
});
