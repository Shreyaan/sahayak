import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";
import { registerWorkflowDefinition, startCase } from "@/lib/workflow";
import { getPublishedWorkflowVersion } from "@/lib/workflow-version";
import { citizenOutcomeService } from "@/lib/citizen-outcome-service";
import { browserOwner, existingBrowserOwnerHash } from "@/lib/browser-owner";

const createSchema = z.object({
  workflowVersionId: z.string().trim().min(1).max(128),
}).strict();

/** Opens a new case, persisted so the citizen can come back to it. */
export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A journey must be chosen." }, { status: 400 });
  }

  let version;
  try {
    version = await getPublishedWorkflowVersion(parsed.data.workflowVersionId);
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE", error: "Journeys are unavailable right now." }, { status: 503 });
  }
  if (!version) return NextResponse.json({ code: "WORKFLOW_VERSION_NOT_FOUND", error: "That published journey was not found." }, { status: 404 });

  registerWorkflowDefinition(version.definition, version.id);
  const caseSnapshot = startCase(version.workflowId, version.id);
  const caseId = crypto.randomUUID();
  const owner = browserOwner(request);

  try {
    await citizenOutcomeService.start(caseId, caseSnapshot, owner.hash);
  } catch {
    return NextResponse.json({ code: "CASE_START_FAILED", error: "The case could not be started. Please try again." }, { status: 503 });
  }

  const response = NextResponse.json(
    { caseId, caseSnapshot, definition: version.definition, trust: version.trust, jurisdiction: { scope: version.scope, stateCode: version.stateCode, districtCode: version.districtCode } },
    { status: 201 },
  );
  if (owner.setCookie) response.headers.set("set-cookie", owner.setCookie);
  return response;
}

/** Recent cases, so a returning citizen can pick one up where it left off. */
export async function GET(request: Request) {
  const ownerHash = existingBrowserOwnerHash(request);
  if (!ownerHash) return NextResponse.json({ cases: [] });
  try {
    const cases = await store.listCases(10, ownerHash);
    return NextResponse.json({ cases });
  } catch {
    return NextResponse.json({ cases: [] });
  }
}
