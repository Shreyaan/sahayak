import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readIntent, type Intent } from "@/lib/intent";
import { defaultLocale, locales, t, type Localized, type Locale } from "@/lib/locale";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";
import {
  applyIntent,
  artifactIdSchema,
  currentNode,
  getWorkflowDefinition,
  type CaseSnapshot,
  registerWorkflowDefinition,
  recordDeskReport,
} from "@/lib/workflow";
import { resolveWorkflow } from "@/lib/workflow-registry";
import { existingBrowserOwnerHash } from "@/lib/browser-owner";
import { redactCitizenText } from "@/lib/citizen-outcomes";
import { getWorkflowVersion } from "@/lib/workflow-version";
import { artifactDraftSchema } from "@/lib/artifact-drafts";

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
  workflowVersionId: z.string().max(128),
  nodes: z.array(
    z.object({
      id: z.string().max(60),
      state: z.enum(["pending", "needs-you", "verifying", "blocked", "done"]),
      startedDay: z.number().int().min(0).max(400).optional(),
    }).strict(),
  ).max(20),
  artifacts: z.array(artifactIdSchema).max(10),
  reports: z.array(z.object({
    stepId: z.string().trim().min(1).max(128),
    optionId: z.string().trim().min(1).max(64),
    response: z.string().trim().min(1).max(2_000),
    responseDate: z.iso.date(),
    referenceNumber: z.string().trim().min(1).max(160).optional(),
    evidence: z.string().trim().min(1).max(1_000).optional(),
    recordedAt: z.iso.datetime(),
    synthetic: z.boolean(),
  }).strict()).max(40).optional(),
  artifactDrafts: z.object({
    "escalation-draft": artifactDraftSchema.optional(),
  }).strict().optional(),
  day: z.number().int().min(0).max(400),
}).strict();

const deskResponseSchema = z.object({
  optionId: z.string().trim().min(1).max(64),
  response: z.string().trim().min(1).max(2_000),
  responseDate: z.iso.date(),
  referenceNumber: z.string().trim().min(1).max(160).optional(),
  evidence: z.string().trim().min(1).max(1_000).optional(),
}).strict();

const requestSchema = z.object({
  action: z.enum(["reply", "record-desk-response"]).default("reply"),
  /** A labeled button answers with its meaning directly; free text is read. */
  intent: z.enum(["affirmative", "negative"]).optional(),
  message: z.string().trim().max(2_000).default(""),
  locale: z.enum(locales).default(defaultLocale),
  caseId: z.string().trim().max(64).optional(),
  caseSnapshot: caseSnapshotSchema,
  deskResponse: deskResponseSchema.optional(),
}).strict().refine(
  ({ action, message, intent, deskResponse }) => action === "record-desk-response"
    ? deskResponse !== undefined
    : message.length > 0 || intent !== undefined,
  { message: "A reply needs a message." },
);

const languageName: Record<Locale, string> = { hi: "Hindi", en: "English" };

const intentSchema = z.object({
  intent: z.enum(["affirmative", "negative", "unclear"]),
}).strict();

/**
 * The clerk's only job: read a free-form reply the deterministic reader could
 * not classify. It returns a signal, never a decision — the engine still owns
 * every transition, and a missing tool result is reported as a provider error.
 */
async function readIntentWithClerk(
  apiKey: string,
  message: string,
  question: string,
  locale: Locale,
): Promise<Intent> {
  let observed: Intent | undefined;

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
    prompt: `Question: ${question}\nCitizen reply: ${redactCitizenText(message)}`,
    timeout: PROVIDER_TIMEOUT_MS,
  });

  if (!observed) throw new Error("AI_INVALID_RESPONSE");
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

  const { action, intent: statedIntent, message, locale, caseId, caseSnapshot: submittedSnapshot, deskResponse } = parsed.data;

  let caseSnapshot = submittedSnapshot;
  let caseOwnerHash: string | undefined;
  if (caseId) {
    const ownerHash = existingBrowserOwnerHash(request);
    if (!ownerHash) {
      return NextResponse.json({ code: "CASE_ACCESS_REQUIRED", error: "This case belongs to another browser." }, { status: 401 });
    }
    caseOwnerHash = ownerHash;
    try {
      const stored = await store.getCase(caseId, ownerHash);
      if (!stored) return NextResponse.json({ code: "CASE_NOT_FOUND", error: "That case was not found." }, { status: 404 });
      caseSnapshot = stored.snapshot;
      const version = await getWorkflowVersion(caseSnapshot.workflowVersionId);
      if (!version || version.workflowId !== caseSnapshot.workflowId) {
        return NextResponse.json({ code: "WORKFLOW_VERSION_NOT_FOUND", error: "This case's workflow version is unavailable." }, { status: 409 });
      }
      registerWorkflowDefinition(version.definition, version.id);
    } catch {
      return NextResponse.json({ code: "DATABASE_UNAVAILABLE", error: "The case is unavailable right now." }, { status: 503 });
    }
  }

  // The journey's definition is the authority for content; the snapshot only
  // carries ids and states. Both bundled and user-added journeys resolve here.
  const definition = caseId
    ? getWorkflowDefinition(caseSnapshot.workflowVersionId)
    : await resolveWorkflow(caseSnapshot.workflowId);
  const seededIds = definition?.nodes.map((node) => node.id);
  if (!seededIds
    || caseSnapshot.nodes.length !== seededIds.length
    || !caseSnapshot.nodes.every((node, index) => node.id === seededIds[index])
  ) {
    return NextResponse.json({ error: "Case nodes do not match the bundled workflow." }, { status: 400 });
  }

  const localize = ({ caseSnapshot: next, reply }: { caseSnapshot: CaseSnapshot; reply: Localized }) =>
    ({ caseSnapshot: next, reply: t(reply, locale) });

  if (action === "record-desk-response") {
    if (!caseId || !deskResponse) {
      return NextResponse.json({ code: "CASE_REQUIRED", error: "A saved case is required to record a response." }, { status: 400 });
    }

    let result;
    try {
      result = localize(recordDeskReport(caseSnapshot, {
        ...deskResponse,
        recordedAt: new Date().toISOString(),
      }));
    } catch {
      return NextResponse.json({ code: "DESK_RESPONSE_NOT_ALLOWED", error: "This step cannot accept that response." }, { status: 409 });
    }

    try {
      await store.saveCaseProgress(caseId, result.caseSnapshot, caseOwnerHash);
    } catch {
      return NextResponse.json({ code: "CASE_SAVE_FAILED", error: "The response could not be saved. Please try again." }, { status: 503 });
    }
    return NextResponse.json(result);
  }

  // A labeled button states its intent outright; free text goes through the
  // deterministic reader first, then the clerk model only if it cannot decide.
  let intent: Intent | undefined = statedIntent;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const node = currentNode(caseSnapshot);

  if (!intent) {
    intent = readIntent(message);

    if (intent === "unknown" && node) {
      if (!apiKey) {
        return NextResponse.json({ code: "AI_UNAVAILABLE", error: "Chat interpretation is unavailable right now." }, { status: 503 });
      }
      try {
        intent = await readIntentWithClerk(apiKey, message, t(node.ask, locale), locale);
      } catch {
        return NextResponse.json({ code: "AI_UNAVAILABLE", error: "Chat interpretation is unavailable right now." }, { status: 503 });
      }
    }
  }

  const result = localize(applyIntent(caseSnapshot, intent ?? "unknown"));

  // Persist the case so the citizen can come back to exactly this state.
  if (caseId) {
    try {
      await store.saveCaseProgress(caseId, result.caseSnapshot, caseOwnerHash);
    } catch {
      return NextResponse.json({ code: "CASE_SAVE_FAILED", error: "The case could not be saved. Please try again." }, { status: 503 });
    }
  }

  return NextResponse.json(result);
}
