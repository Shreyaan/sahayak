import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { store } from "@/lib/store";
import {
  compileWorkflow,
  assignWorkflowId,
  workflowSpecSchema,
  type WorkflowSpec,
} from "@/lib/custom-workflow";
import { registerWorkflowDefinition, workflowIds, type WorkflowDefinition } from "@/lib/workflow";
import { listAllWorkflowDefinitions, loadCustomWorkflows } from "@/lib/workflow-registry";

/**
 * Best-effort bilingual pass: when the model is configured it fills in the
 * language the author did not write in. On any failure the compiled text
 * (shared across both languages) stands.
 */
async function translateDefinition(definition: WorkflowDefinition): Promise<WorkflowDefinition> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return definition;

  const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
  const { generateText } = await import("ai");

  const authored = {
    title: definition.title.en,
    subtitle: definition.subtitle.en,
    steps: definition.nodes.slice(0, -1).map((node) => ({
      title: node.title.en,
      detail: node.detail.en,
      ask: node.ask.en,
    })),
  };

  try {
    const openrouter = createOpenRouter({ apiKey });
    const result = await generateText({
      model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
      prompt:
        "Translate each value in this JSON into natural Hindi, keeping the English too. "
        + "Reply with ONLY JSON of shape {title:{hi,en},subtitle:{hi,en},steps:[{title:{hi,en},detail:{hi,en},ask:{hi,en}}]} "
        + `with one step per input step, same order. Input: ${JSON.stringify(authored)}`,
      maxOutputTokens: 2_000,
      abortSignal: AbortSignal.timeout(12_000),
    });

    const cleaned = result.text.trim().replace(/^```json\s*|```$/g, "");
    const parsed = JSON.parse(cleaned) as {
      title?: { hi?: string; en?: string };
      subtitle?: { hi?: string; en?: string };
      steps?: Array<{ title?: { hi?: string; en?: string }; detail?: { hi?: string; en?: string }; ask?: { hi?: string; en?: string } }>;
    };
    if (!parsed?.title?.hi || !Array.isArray(parsed.steps) || parsed.steps.length !== authored.steps.length) {
      return definition;
    }

    const pick = (value: { hi?: string; en?: string } | undefined, fallback: string) =>
      value?.hi && value?.en ? { hi: value.hi, en: value.en } : { hi: fallback, en: fallback };

    return {
      ...definition,
      title: pick(parsed.title, definition.title.en),
      subtitle: pick(parsed.subtitle, definition.subtitle.en),
      nodes: definition.nodes.map((node, index) => {
        const step = parsed.steps?.[index];
        if (!step) return node;
        return {
          ...node,
          title: pick(step.title, node.title.en),
          detail: pick(step.detail, node.detail.en),
          ask: pick(step.ask, node.ask.en),
        };
      }),
    };
  } catch {
    return definition;
  }
}

export async function GET() {
  return NextResponse.json({ workflows: await listAllWorkflowDefinitions() });
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = workflowSpecSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A workflow needs a title and at least one step." }, { status: 400 });
  }

  const spec: WorkflowSpec = parsed.data;
  await loadCustomWorkflows();
  const taken = new Set([
    ...workflowIds,
    ...(await store.listWorkflows().catch(() => [])).map((row) => row.id),
  ]);
  const id = assignWorkflowId(spec, taken);
  const compiled = compileWorkflow(spec, id);
  const definition = await translateDefinition({
    ...compiled,
    authoredBy: "web-form" as const,
    authoredAt: new Date().toISOString(),
  });

  registerWorkflowDefinition(definition);

  let saved = true;
  try {
    await store.saveWorkflow(definition, id);
  } catch {
    saved = false;
  }

  return NextResponse.json({ definition, saved }, { status: 201 });
}
