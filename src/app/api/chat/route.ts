import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isRateLimited } from "@/lib/rate-limit";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  workflows,
  type CaseSnapshot,
} from "@/lib/workflow";

/**
 * A snapshot carries only node ids and states — never titles, questions, or
 * policy text. All content is read from the bundled seed on the server, so a
 * client cannot introduce a step or a requirement that the workflow never had.
 */
const caseSnapshotSchema = z.object({
  workflowId: z.enum(["bereavement", "scholarship"]),
  nodes: z.array(
    z.object({
      id: z.string().max(60),
      state: z.enum(["pending", "needs-you", "verifying", "blocked", "done"]),
      note: z.string().max(200).optional(),
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
}).strict().refine(
  (snapshot) => {
    const seeded = workflows[snapshot.workflowId].nodes.map((node) => node.id);
    return snapshot.nodes.length === seeded.length
      && snapshot.nodes.every((node, index) => node.id === seeded[index]);
  },
  { message: "Case nodes do not match the bundled workflow." },
);

const requestSchema = z.object({
  action: z.enum(["reply", "advance-day"]).default("reply"),
  message: z.string().trim().max(2_000).default(""),
  caseSnapshot: caseSnapshotSchema,
}).strict().refine(
  ({ action, message }) => action === "advance-day" || message.length > 0,
  { message: "A reply needs a message." },
);

function resolve(action: "reply" | "advance-day", caseSnapshot: CaseSnapshot, message: string) {
  return action === "advance-day"
    ? advanceDay(caseSnapshot)
    : applyCitizenReply(caseSnapshot, message);
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Message and case are required." }, { status: 400 });
  }

  const { action, message, caseSnapshot } = parsed.data;
  const authorized = resolve(action, caseSnapshot, message);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey || action === "advance-day") {
    return NextResponse.json(authorized);
  }

  const node = currentNode(caseSnapshot);
  const openrouter = createOpenRouter({ apiKey });
  const agent = new ToolLoopAgent({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions:
      "You are Sahayak, a concise Hindi-first government-work clerk. Call getCaseOutcome before answering. "
      + "Never add policy, fees, offices, requirements, timelines, or actions that are not in its result. "
      + "You never decide whether a case advances.",
    tools: {
      getCaseOutcome: tool({
        description: "The only authorized case transition, reply, and current step facts.",
        inputSchema: z.object({}),
        execute: async () => ({
          reply: authorized.reply,
          currentStep: node && { title: node.title, detail: node.detail, ask: node.ask },
          caseSnapshot: authorized.caseSnapshot,
        }),
      }),
    },
    stopWhen: isStepCount(3),
  });

  try {
    await agent.generate({ prompt: message, timeout: 15_000 });
  } catch {
    // The deterministic outcome below stands regardless of provider failure.
  }

  return NextResponse.json(authorized);
}
