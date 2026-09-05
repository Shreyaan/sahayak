import { beforeAll, describe, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { POST as startCase } from "./route";
import { GET as getCase } from "./[id]/route";

function startRequest() {
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify({ workflowVersionId: "scholarship-v1" }),
  });
}

describe("GET /api/cases/:id", () => {
  beforeAll(seedPublishedWorkflows);

  test("returns the exact saved version only to the browser that owns the case", async () => {
    const started = await startCase(startRequest());
    const body = await started.json();
    const ownerCookie = started.headers.get("set-cookie")?.split(";", 1)[0];

    const ownedRequest = new Request(`http://localhost/api/cases/${body.caseId}`);
    ownedRequest.headers.set("cookie", ownerCookie!);
    const owned = await getCase(ownedRequest, { params: Promise.resolve({ id: body.caseId }) });
    expect(owned.status).toBe(200);
    expect(await owned.json()).toMatchObject({
      case: { id: body.caseId, snapshot: { workflowVersionId: "scholarship-v1" } },
      definition: { id: "scholarship" },
      trust: {
        provenance: "official-source-reviewed",
        currentExpertSupportCount: 0,
        hasUnresolvedDisagreement: false,
      },
    });

    const otherRequest = new Request(`http://localhost/api/cases/${body.caseId}`);
    otherRequest.headers.set("cookie", `sahayak-browser=${crypto.randomUUID()}`);
    const other = await getCase(otherRequest, { params: Promise.resolve({ id: body.caseId }) });
    expect(other.status).toBe(404);
  });
});
