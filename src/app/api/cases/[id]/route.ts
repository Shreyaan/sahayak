import { NextResponse } from "next/server";
import { z } from "zod";
import { existingBrowserOwnerHash } from "@/lib/browser-owner";
import { store } from "@/lib/store";
import { getWorkflowVersion } from "@/lib/workflow-version";

type Context = { params: Promise<{ id: string }> };
const caseIdSchema = z.string().uuid();

export async function GET(request: Request, context: Context) {
  const parsedId = caseIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return NextResponse.json({ code: "INVALID_CASE", error: "That case identifier is invalid." }, { status: 400 });
  }

  const ownerHash = existingBrowserOwnerHash(request);
  if (!ownerHash) {
    return NextResponse.json({ code: "CASE_ACCESS_REQUIRED", error: "This case belongs to another browser." }, { status: 401 });
  }

  try {
    const savedCase = await store.getCase(parsedId.data, ownerHash);
    if (!savedCase) return NextResponse.json({ code: "CASE_NOT_FOUND", error: "That case was not found." }, { status: 404 });

    const version = await getWorkflowVersion(savedCase.snapshot.workflowVersionId);
    if (!version || version.workflowId !== savedCase.snapshot.workflowId) {
      return NextResponse.json({ code: "WORKFLOW_VERSION_NOT_FOUND", error: "This case's workflow version is unavailable." }, { status: 409 });
    }

    return NextResponse.json({ case: savedCase, definition: version.definition, trust: version.trust, jurisdiction: { scope: version.scope, stateCode: version.stateCode, districtCode: version.districtCode } });
  } catch {
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE", error: "The case is unavailable right now." }, { status: 503 });
  }
}
