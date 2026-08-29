import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compileContribution, type ContributionDraft } from "@/lib/contribution";
import { isRateLimited } from "@/lib/rate-limit";

const requestSchema = z.object({
  input: z.string().trim().min(1).max(2_000),
}).strict();

const contributionEnrichmentSchema = z.object({
  title: z.string().trim().min(1),
  steps: z.array(z.string().trim().min(1)).min(1),
  additions: z.array(z.string().trim().min(1)),
}).strict();

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Contribution input is required." }, { status: 400 });
  }

  const fallback = compileContribution(parsed.data.input);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  let enrichment: Pick<ContributionDraft, "title" | "steps" | "additions"> | undefined;

  try {
    const openrouter = createOpenRouter({ apiKey });
    const agent = new ToolLoopAgent({
      model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
      instructions:
        "Compile this synthetic lived experience into a cautious bereavement workflow draft. Call compileDraft exactly once. Keep sourceType as lived experience, corroborationCount as 1, and status as draft. Do not present policy as authoritative.",
      tools: {
        compileDraft: tool({
          description: "Return a reviewable synthetic contribution draft.",
          inputSchema: contributionEnrichmentSchema,
          execute: async (draft) => {
            enrichment = draft;
            return { ...fallback, ...draft };
          },
        }),
      },
      stopWhen: isStepCount(3),
    });
    await agent.generate({ prompt: parsed.data.input, timeout: 15_000 });
    return NextResponse.json(enrichment ? { ...fallback, ...enrichment } : fallback);
  } catch {
    return NextResponse.json(fallback);
  }
}
