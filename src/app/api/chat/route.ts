import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readIntent, type Intent } from "@/lib/intent";
import { defaultLocale, locales, t, type Localized, type Locale } from "@/lib/locale";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";
import {
  advanceDay,
  applyIntent,
  currentNode,
  type CaseSnapshot,
} from "@/lib/workflow";
import { resolveWorkflow } from "@/lib/workflow-registry";

export const maxDuration = 30;

const PROVIDER_TIMEOUT_MS = 8_000;

/**
 * A snapshot carries only node ids and states — never titles, questions, notes,
 * or policy text. All content is read back from the journey's definition on the
 * server, so a client cannot introduce a step or a requirement that the
 * workflow never had.
 */
const caseSnapshotSchema = z.object({
  workflowId: z.string().max(64),
  nodes: z.array(
    z.object({
      id: z.string().max(60),
      state: z.enum(["pending", "needs-you", "verifying", "blocked", "done"]),
      startedDay: z.number().int().min(0).max(400).optional(),
    }).strict(),
  ).max(20),
  artifacts: z.array(
    z.enum([
      "correction-declaration",
      "bank-letter",
      "rti-draft",
      "npci-checklist",
      "escalation-draft",
    ]),
  ).max(10),
  day: z.number().int().min(0).max(400),
}).strict();

const requestSchema = z.object({
  action: z.enum(["reply", "advance-day"]).default("reply"),
  message: z.string().trim().max(2_000).default(""),
  locale: z.enum(locales).default(defaultLocale),
  caseId: z.string().trim().max(64).optional(),
  caseSnapshot: caseSnapshotSchema,
}).strict().refine(
  ({ action, message }) => action === "advance-day" || message.length > 0,
  { message: "A reply needs a message." },
);

const languageName: Record<Locale, string> = { hi: "Hindi", en: "English" };

const intentSchema = z.object({
  intent: z.enum(["affirmative", "negative", "unclear"]),
}).strict();

/**
 * The clerk's only job: read a free-form reply the deterministic reader could
 * not classify. It returns a signal, never a decision — the engine still owns
 * every transition, and an unusable answer simply stays `unknown`.
 */
async function readIntentWithClerk(
  apiKey: string,
  message: string,
  question: string,
  locale: Locale,
): Promise<Intent> {
  let observed: Intent = "unknown";

  const openrouter = createOpenRouter({ apiKey });
  const agent = new ToolLoopAgent({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions:
      `You are Sahayak, a government-work clerk. The citizen is speaking ${languageName[locale]}, `
      + "and may mix in English words. You are given the question just asked and the citizen's reply. "
      + "Call reportIntent exactly once to say whether the reply confirms the question, denies or "
      + "corrects it, or is unclear. Report only what the citizen said. Never decide what happens to "
      + "the case, and never state policy, fees, or outcomes.",
    tools: {
      reportIntent: tool({
        description: "Report how the citizen's reply answers the question.",
        inputSchema: intentSchema,
        execute: async ({ intent }) => {
          observed = intent === "unclear" ? "unknown" : intent;
          return { recorded: true };
        },
      }),
    },
    stopWhen: isStepCount(2),
  });

  await agent.generate({
    prompt: `Question: ${question}\nCitizen reply: ${message}`,
    timeout: PROVIDER_TIMEOUT_MS,
  });

  return observed;
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Message and case are required." }, { status: 400 });
  }

  const { action, message, locale, caseId, caseSnapshot } = parsed.data;

  // The journey's definition is the authority for content; the snapshot only
  // carries ids and states. Both bundled and user-added journeys resolve here.
  const definition = await resolveWorkflow(caseSnapshot.workflowId);
  const seededIds = definition?.nodes.map((node) => node.id);
  if (!seededIds
    || caseSnapshot.nodes.length !== seededIds.length
    || !caseSnapshot.nodes.every((node, index) => node.id === seededIds[index])
  ) {
    return NextResponse.json({ error: "Case nodes do not match the bundled workflow." }, { status: 400 });
  }

  const localize = ({ caseSnapshot: next, reply }: { caseSnapshot: CaseSnapshot; reply: Localized }) =>
    ({ caseSnapshot: next, reply: t(reply, locale) });

  if (action === "advance-day") {
    return NextResponse.json(localize(advanceDay(caseSnapshot)));
  }

  let intent = readIntent(message);
  const apiKey = process.env.OPENROUTER_API_KEY;
  const node = currentNode(caseSnapshot);

  // The model is consulted only when the deterministic reader cannot decide.
  if (intent === "unknown" && apiKey && node) {
    try {
      intent = await readIntentWithClerk(apiKey, message, t(node.ask, locale), locale);
    } catch {
      // An unreadable reply simply re-asks the question below.
    }
  }

  const result = localize(applyIntent(caseSnapshot, intent));

  // Persist the case so the citizen can come back to exactly this state.
  if (caseId) {
    try {
      await store.saveCase(caseId, result.caseSnapshot);
    } catch {
      // The chat reply stands even if persistence hiccups.
    }
  }

  return NextResponse.json(result);
}
