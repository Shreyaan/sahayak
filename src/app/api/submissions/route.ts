import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";

const localizedSchema = z.object({
  hi: z.string().max(2_000),
  en: z.string().max(2_000),
});

const draftSchema = z.object({
  workflowId: z.string().trim().min(1).max(64),
  title: localizedSchema,
  steps: z.array(localizedSchema).max(20),
  matches: z.array(localizedSchema).max(20),
  additions: z.array(localizedSchema).max(20),
  conflicts: z.array(z.object({
    field: localizedSchema,
    submitted: localizedSchema,
    bundled: localizedSchema,
    reason: localizedSchema,
  })).max(10),
  sourceType: z.string().max(60),
  corroborationCount: z.number().int().min(0).max(1_000),
  status: z.enum(["draft", "needs review", "publishable draft"]),
}).strict();

const submitSchema = z.object({
  input: z.string().trim().min(1).max(4_000),
  draft: draftSchema,
}).strict();

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A compiled draft is required." }, { status: 400 });
  }

  try {
    await store.saveSubmission({
      workflowId: parsed.data.draft.workflowId,
      input: parsed.data.input,
      draft: parsed.data.draft,
    });
  } catch {
    return NextResponse.json({ error: "Could not save the submission." }, { status: 500 });
  }

  return NextResponse.json({ saved: true }, { status: 201 });
}

export async function GET() {
  try {
    const submissions = await store.listSubmissions(10);
    return NextResponse.json({
      submissions: submissions.map((submission) => ({
        id: submission.id,
        createdAt: submission.createdAt,
        workflowId: submission.workflowId,
        title: (submission.draft as { title?: { hi?: string; en?: string } })?.title?.en ?? "",
        status: (submission.draft as { status?: string })?.status ?? "",
      })),
    });
  } catch {
    return NextResponse.json({ submissions: [] });
  }
}
