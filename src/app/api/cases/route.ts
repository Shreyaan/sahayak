import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";
import { startCase } from "@/lib/workflow";
import { resolveWorkflow } from "@/lib/workflow-registry";

const createSchema = z.object({
  workflowId: z.string().trim().min(1).max(64),
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

  const definition = await resolveWorkflow(parsed.data.workflowId);
  if (!definition) {
    return NextResponse.json({ error: "Unknown journey." }, { status: 400 });
  }

  const caseSnapshot = startCase(definition.id);
  const caseId = crypto.randomUUID();

  let saved = true;
  try {
    await store.saveCase(caseId, caseSnapshot);
  } catch {
    saved = false;
  }

  return NextResponse.json({ caseId, caseSnapshot, saved }, { status: 201 });
}

/** Recent cases, so a returning citizen can pick one up where it left off. */
export async function GET() {
  try {
    const cases = await store.listCases(10);
    return NextResponse.json({ cases });
  } catch {
    return NextResponse.json({ cases: [] });
  }
}
