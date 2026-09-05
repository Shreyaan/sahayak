import { beforeAll, describe, expect, test } from "bun:test";
import { seedPublishedWorkflows } from "@/db/seed";
import { POST } from "./route";
import { citizenOutcomeService } from "@/lib/citizen-outcome-service";

function request(body: unknown) {
  return new Request("http://localhost/api/cases", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

describe("POST /api/cases exact workflow version", () => {
  beforeAll(async () => {
    await seedPublishedWorkflows();
  });

  test("does not accept a mutable workflow identity as a start target", async () => {
    const response = await POST(request({ workflowId: "bereavement" }));

    expect(response.status).toBe(400);
  });

  test("starts and binds the exact published version returned by search", async () => {
    const response = await POST(request({ workflowVersionId: "scholarship-v1" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.caseSnapshot.workflowId).toBe("scholarship");
    expect(body.caseSnapshot.workflowVersionId).toBe("scholarship-v1");
    expect(body.definition.id).toBe("scholarship");
    expect(body).toMatchObject({
      trust: {
        provenance: "official-source-reviewed",
        currentExpertSupportCount: 0,
        hasUnresolvedDisagreement: false,
      },
      jurisdiction: { scope: "central", stateCode: null, districtCode: null },
    });
    expect(body.outcomeTracked).toBeUndefined();
    expect(await citizenOutcomeService.list(body.caseId)).toEqual([
      expect.objectContaining({
        caseId: body.caseId,
        workflowVersionId: "scholarship-v1",
        kind: "awareness",
        stepId: null,
      }),
    ]);
  });
});
