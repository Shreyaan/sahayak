import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { isStepCount, tool, ToolLoopAgent } from "ai";
import { z } from "zod";
import { redactCitizenText } from "@/lib/citizen-outcomes";
import type { Locale } from "@/lib/locale";

const questionSchema = z.object({
  question: z.string().trim().min(5).max(240),
}).strict();

const languageName: Record<Locale, string> = { hi: "Hindi", en: "English" };

/** The AI may ask for context, but it never chooses or creates a workflow. */
export async function clarifySearch(input: {
  query: string;
  locale: Locale;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI_UNAVAILABLE");

  let question: string | undefined;
  try {
    const openrouter = createOpenRouter({ apiKey });
    const agent = new ToolLoopAgent({
      model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
      instructions:
        `You are Sahayak's clarification clerk. Write in ${languageName[input.locale]}. `
        + "Search has already decided that there is no safe workflow match. Call askQuestion exactly once "
        + "with one short question "
        + "that would help identify the government process, portal, office, or payment involved. Do not give "
        + "instructions, claim a workflow exists, request identity or bank numbers, or decide what the citizen should do.",
      tools: {
        askQuestion: tool({
          description: "Return the single clarification question to show the citizen.",
          inputSchema: questionSchema,
          execute: async (value) => {
            question = value.question;
            return { accepted: true };
          },
        }),
      },
      stopWhen: isStepCount(2),
    });
    await agent.generate({
      prompt: `Citizen description: ${redactCitizenText(input.query)}`,
      timeout: 6_000,
    });
  } catch (error) {
    throw new Error("AI_UNAVAILABLE", { cause: error });
  }

  if (!question) throw new Error("AI_INVALID_RESPONSE");
  return question;
}
