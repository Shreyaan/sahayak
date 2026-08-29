import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { replyToCitizen } from "@/lib/reply";

const caseSchema = z.object({
  id: z.string(),
  nodes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      state: z.enum(["pending", "needs-you", "done"]),
    }),
  ),
});

const requestSchema = z.object({
  message: z.string().trim().min(1),
  caseSnapshot: caseSchema,
});

export async function POST(request: Request) {
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

  let usedCaseTool = false;
  const openrouter = createOpenRouter({ apiKey });
  const agent = new ToolLoopAgent({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    instructions:
      "You are Sahayak, a concise Hindi-first government-work helper. Call getCaseOutcome before answering. Never add policy, fees, requirements, or actions that are not in its result.",
    tools: {
      getCaseOutcome: tool({
        description: "Get the only authorized case transition and response.",
        inputSchema: z.object({}),
        execute: async () => {
          usedCaseTool = true;
          return authorizedOutcome;
        },
      }),
    },
    stopWhen: isStepCount(3),
  });

  try {
    const result = await agent.generate({ prompt: message });
    return NextResponse.json({
      reply: usedCaseTool && result.text ? result.text : authorizedOutcome.reply,
      caseSnapshot: authorizedOutcome.caseSnapshot,
    });
  } catch {
    return NextResponse.json(authorizedOutcome);
  }
}
