import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compileGeneratedContribution, generatedContributionSchema, type ContributionDraft } from "@/lib/contribution";
import { defaultLocale, locales } from "@/lib/locale";
import type { Localized } from "@/lib/locale";
import { isRateLimited } from "@/lib/rate-limit";
import { signContributionPreview } from "@/lib/contribution-preview";
import { jurisdictionSchema, type ReviewJurisdiction } from "@/lib/review-case";
import { indiaStates, resolveJurisdiction } from "@/lib/india-locations";

const requestSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  input: z.string().trim().min(1).max(2_000),
  locale: z.enum(locales).default(defaultLocale),
  jurisdiction: jurisdictionSchema.optional(),
}).strict();

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_CONTRIBUTION", message: "Contribution input is required." } }, { status: 400 });
  }

  const { input } = parsed.data;
  const preview = (draft: ContributionDraft, jurisdiction: ReviewJurisdiction, jurisdictionReason?: Localized) => {
    try {
      return NextResponse.json({ ...draft, jurisdiction, jurisdictionReason, previewToken: signContributionPreview({ submittedTitle: parsed.data.title, input, jurisdiction, draft: {
        workflowId: draft.workflowId, definition: draft.definition, title: draft.title, summary: draft.summary, steps: draft.steps, matches: draft.matches,
        additions: draft.additions, conflicts: draft.conflicts, sourceType: draft.sourceType,
      } }) });
    } catch (error) {
      if (error instanceof Error && error.message === "PREVIEW_TOKEN_UNAVAILABLE") {
        return NextResponse.json({ error: { code: "PREVIEW_UNAVAILABLE", message: "Contribution preview is unavailable right now." } }, { status: 503 });
      }
      throw error;
    }
  };
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      error: { code: "AI_UNAVAILABLE", message: "Draft preparation is unavailable right now." },
    }, { status: 503 });
  }

  let preparedDraft: ContributionDraft | undefined;
  let generatedJurisdiction: z.infer<typeof generatedContributionSchema>["jurisdiction"] | undefined;

  try {
    const openrouter = createOpenRouter({ apiKey });
    const agent = new ToolLoopAgent({
      model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
      instructions: "You are Sahayak's drafting clerk. Turn a contributor's lived experience into a concise proposed citizen journey for expert review. "
        + "If a contributorTitle is provided, use it only as a topic hint; replace vague wording and do not copy personal names or identifiers into the draft title. "
        + "Call draftJourney exactly once. Write every field in semantically equivalent Hindi and English. Draft 2–7 clear actions that answer what to do next; do not merely retell the past event. "
        + "Use the contributor's evidence first. You may infer a useful next action, but every inferred government process, office, document, timeline, acknowledgement, or escalation must have a specific reviewFlag saying what an expert must verify. "
        + "Never invent exact addresses, URLs, fees, eligibility rules, application data, or a successful government outcome. Preserve uncertainty and do not claim the draft is official, safe, approved, or complete. "
        + "Use kind=visit for an in-person action, kind=desk for submitting or checking something with an office, and kind=confirm for preparation or confirmation. Each ask must be a short question the citizen can answer after attempting that action. "
        + `Suggest the most likely jurisdiction. For state or district scope, use an exact English state name from: ${indiaStates.map((state) => state.name).join(", ")}. `
        + "For district scope, use the exact district name when known; explain the reasoning and flag uncertainty for expert review.",
      tools: {
        draftJourney: tool({
          description: "Return one bilingual, actionable journey draft and its expert-verification gaps.",
          inputSchema: generatedContributionSchema,
          execute: async (generated) => {
            generatedJurisdiction = generated.jurisdiction;
            preparedDraft = compileGeneratedContribution(generated);
            return preparedDraft;
          },
        }),
      },
      stopWhen: isStepCount(3),
    });
    await agent.generate({
      prompt: JSON.stringify({
        contributorTitle: parsed.data.title ?? "not provided",
        experience: input,
        contributorJurisdiction: parsed.data.jurisdiction ?? "not provided",
      }),
      timeout: 30_000,
    });
    if (!preparedDraft) {
      return NextResponse.json({
        error: { code: "AI_INVALID_RESPONSE", message: "Draft preparation did not return a usable result." },
      }, { status: 502 });
    }
    const suggestion = generatedJurisdiction;
    if (!parsed.data.jurisdiction && !suggestion) throw new Error("AI_INVALID_RESPONSE");
    const jurisdiction = parsed.data.jurisdiction ?? resolveJurisdiction(suggestion!);
    return preview(preparedDraft, jurisdiction, parsed.data.jurisdiction ? undefined : suggestion!.reason);
  } catch (error) {
    if (error instanceof Error && ["AI_INVALID_RESPONSE", "INVALID_JURISDICTION_SUGGESTION"].includes(error.message)) {
      return NextResponse.json({
        error: { code: "AI_INVALID_RESPONSE", message: "Draft preparation did not return a usable result." },
      }, { status: 502 });
    }
    return NextResponse.json({
      error: { code: "AI_UNAVAILABLE", message: "Draft preparation is unavailable right now." },
    }, { status: 503 });
  }
}
