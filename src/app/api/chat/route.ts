import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToCitizen } from "@/lib/reply";
import { isRateLimited } from "@/lib/rate-limit";

const caseSchema = z.object({
  id: z.literal("bereavement-demo"),
  nodes: z.tuple([
    z.object({
      id: z.literal("confirm-name"),
      title: z.literal("नाम की पुष्टि"),
      state: z.enum(["pending", "needs-you", "done"]),
    }).strict(),
    z.object({
      id: z.literal("bank-claim"),
      title: z.literal("बैंक क्लेम तैयार करें"),
      state: z.enum(["pending", "needs-you", "done"]),
    }).strict(),
  ]),
}).strict().refine(
  ({ nodes }) =>
    (nodes[0].state === "needs-you" && nodes[1].state === "pending")
    || (nodes[0].state === "done" && nodes[1].state === "needs-you"),
  { message: "Case state is not allowed." },
);

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  caseSnapshot: caseSchema,
}).strict();

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json({ error: "Message and case are required." }, { status: 400 });
  }

  const { message, caseSnapshot } = parsed.data;
  const authorizedOutcome = replyToCitizen(caseSnapshot, message);
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return NextResponse.json(authorizedOutcome);
  }

  const openrouter = createOpenRouter({ apiKey });
  const agent = new ToolLoopAgent({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions:
      "You are Sahayak, a concise Hindi-first government-work helper. Call getCaseOutcome before answering. Never add policy, fees, requirements, or actions that are not in its result.",
    tools: {
      getCaseOutcome: tool({
        description: "Get the only authorized case transition and response.",
        inputSchema: z.object({}),
        execute: async () => authorizedOutcome,
      }),
    },
    stopWhen: isStepCount(3),
  });

  try {
    await agent.generate({ prompt: message, timeout: 15_000 });
    return NextResponse.json(authorizedOutcome);
  } catch {
    return NextResponse.json(authorizedOutcome);
  }
}
