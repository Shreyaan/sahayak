import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compileContribution, type ContributionDraft } from "@/lib/contribution";

const requestSchema = z.object({
  input: z.string().trim().min(1),
});

const contributionDraftSchema = z.object({
  title: z.string().trim().min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
  matches: z.array(z.string().trim().min(1)),
  additions: z.array(z.string().trim().min(1)),
  conflicts: z.array(
    z.object({
      field: z.string().trim().min(1),
      submitted: z.string().trim().min(1),
      bundled: z.string().trim().min(1),
      reason: z.string().trim().min(1),
    }),
  ),
  sourceType: z.literal("lived experience"),
  corroborationCount: z.literal(1),
  status: z.literal("draft"),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Contribution input is required." }, { status: 400 });
  }

  const fallback = compileContribution(parsed.data.input);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  let compiledDraft: ContributionDraft | undefined;
  const openrouter = createOpenRouter({ apiKey });
  const agent = new ToolLoopAgent({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions:
      "Compile this synthetic lived experience into a cautious bereavement workflow draft. Call compileDraft exactly once. Keep sourceType as lived experience, corroborationCount as 1, and status as draft. Do not present policy as authoritative.",
    tools: {
      compileDraft: tool({
        description: "Return a reviewable synthetic contribution draft.",
        inputSchema: contributionDraftSchema,
        execute: async (draft) => {
          compiledDraft = draft;
          return draft;
        },
      }),
    },
    stopWhen: isStepCount(3),
  });

  try {
    await agent.generate({ prompt: parsed.data.input });
    return NextResponse.json(compiledDraft ?? fallback);
  } catch {
    return NextResponse.json(fallback);
  }
}
