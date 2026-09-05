import { NextResponse } from "next/server";
import { listPublishedWorkflowVersions } from "@/lib/workflow-version";

/** Citizen-visible library contains only immutable published versions. */
export async function GET() {
  try {
    const versions = await listPublishedWorkflowVersions();
    return NextResponse.json({ workflows: versions.map((version) => ({
      id: version.workflowId,
      workflowVersionId: version.id,
      version: version.version,
      definition: version.definition,
      jurisdiction: { scope: version.scope, stateCode: version.stateCode, districtCode: version.districtCode },
      trust: version.trust,
    })) });
  } catch {
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE", message: "The workflow library is unavailable right now." } }, { status: 503 });
  }
}

/** Direct workflow creation was retired: contributor drafts must enter expert review. */
export async function POST() {
  return NextResponse.json({
    error: {
      code: "WORKFLOW_SUBMISSION_RETIRED",
      message: "Submit a lived experience for expert review instead.",
    },
  }, { status: 410 });
}
