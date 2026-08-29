import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compileContribution, type ContributionDraft } from "@/lib/contribution";
import { defaultLocale, locales, type Locale, type Localized } from "@/lib/locale";
import { isRateLimited } from "@/lib/rate-limit";

const requestSchema = z.object({
  input: z.string().trim().min(1).max(2_000),
  locale: z.enum(locales).default(defaultLocale),
}).strict();

/**
 * The model may only improve wording. Matches, conflicts, corroboration, source
 * type, status, and the detected workflow stay server-derived, and server
 * additions are merged rather than replaced.
 */
const contributionEnrichmentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  steps: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  additions: z.array(z.string().trim().min(1).max(300)).max(12),
}).strict();

/**
 * The model writes in the contributor's own language, so its wording replaces
 * only that language. The other language keeps the deterministic text, which
 * means a draft is never left half-written.
 */
function inLocale(base: Localized, written: string, locale: Locale): Localized {
  return { ...base, [locale]: written };
}

function merge(
  fallback: ContributionDraft,
  enrichment: z.infer<typeof contributionEnrichmentSchema>,
  locale: Locale,
): ContributionDraft {
  const extraAdditions = enrichment.additions
    .filter((addition) => !fallback.additions.some((known) => known[locale] === addition))
    .map((addition) => inLocale({ hi: addition, en: addition }, addition, locale));

  return {
    ...fallback,
    title: inLocale(fallback.title, enrichment.title, locale),
    steps: enrichment.steps.map((step, index) =>
      inLocale(fallback.steps[index] ?? { hi: step, en: step }, step, locale),
    ),
    additions: [...fallback.additions, ...extraAdditions],
  };
}

const languageName: Record<Locale, string> = { hi: "Hindi", en: "English" };

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Contribution input is required." }, { status: 400 });
  }

  const { input, locale } = parsed.data;
  const fallback = compileContribution(input);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(fallback);
  }

  let enrichment: z.infer<typeof contributionEnrichmentSchema> | undefined;

  try {
    const openrouter = createOpenRouter({ apiKey });
    const agent = new ToolLoopAgent({
      model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
      instructions:
        `Write in ${languageName[locale]}. `
        + "Compile this synthetic lived experience into a cautious workflow draft. Call compileDraft exactly once "
        + "to improve only the title, steps, and additions. Matches, conflicts, corroboration, source type, and "
        + "status are decided by the server; never restate or contradict them. Do not present policy as authoritative.",
      tools: {
        compileDraft: tool({
          description: "Return a reviewable synthetic contribution draft.",
          inputSchema: contributionEnrichmentSchema,
          execute: async (draft) => {
            enrichment = draft;
            return merge(fallback, draft, locale);
          },
        }),
      },
      stopWhen: isStepCount(3),
    });
    await agent.generate({ prompt: input, timeout: 15_000 });
    return NextResponse.json(enrichment ? merge(fallback, enrichment, locale) : fallback);
  } catch {
    return NextResponse.json(fallback);
  }
}
