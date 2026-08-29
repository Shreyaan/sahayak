import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  compileWorkflow,
  assignWorkflowId,
  reviewFlagsFor,
  suggestionsFor,
  workflowSpecShape,
} from "@/lib/custom-workflow";
import { store } from "@/lib/store";
import { registerWorkflowDefinition, workflowIds } from "@/lib/workflow";
import { listAllWorkflowDefinitions, loadCustomWorkflows } from "@/lib/workflow-registry";

/**
 * The Sahayak MCP server: a machine-facing contributor intake. An AI client
 * (ChatGPT, Claude, any MCP host) can read the journey catalog and propose a
 * new workflow from a conversation. It is an adapter over the same compiler
 * the web form uses — never a second implementation.
 *
 * The instructions below are conversational guidance for the clerk model, not
 * a security boundary: the compiler and store enforce every structural rule.
 */
export function buildSahayakMcpServer(): McpServer {
  const server = new McpServer(
    { name: "sahayak", version: "1.0.0" },
    {
      instructions:
        "Sahayak turns lived experiences with government processes into guided, step-by-step workflows that citizens can walk through with speech or text. "
        + "To add a workflow: listen to the contributor's story, then propose it with propose_workflow. "
        + "Before proposing, confirm with the contributor: (1) the exact order of steps; (2) for each step, whether it is a simple 'confirm' (ask and move on), a 'visit' (an in-person office counter trip), a 'website' (an action on a public portal, with its exact https URL), or a 'desk' (submitting something and waiting for a desk to reply); (3) what documents to carry at any visit; (4) realistic waiting times for desk checks. "
        + "Write step titles as short actions in the contributor's own language. "
        + "Never invent fees, offices, or requirements the contributor did not mention. If the contributor mentions paying an agent or middleman, warn them and do not make it a step. "
        + "After proposing, share the returned preview link so the contributor can review the journey before telling others about it.",
    },
  );

  server.registerTool(
    "list_workflows",
    {
      title: "List journeys",
      description:
        "List every journey currently on Sahayak, including journeys contributed by other people. "
        + "Use this before proposing a new workflow to check whether a similar one already exists.",
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const definitions = await listAllWorkflowDefinitions();

      const workflows = definitions.map((definition) => ({
        id: definition.id,
        title: definition.title.en,
        subtitle: definition.subtitle.en,
        stepCount: definition.nodes.length - 1,
        authoredBy: definition.authoredBy ?? "bundled",
      }));

      return {
        content: [{
          type: "text",
          text: workflows.map((w) => `${w.title} (${w.id}, ${w.stepCount} steps)`).join("\n"),
        }],
        structuredContent: { workflows },
      };
    },
  );

  server.registerTool(
    "get_workflow",
    {
      title: "Get a journey",
      description:
        "Get the full step-by-step definition of one journey by its id, as returned by list_workflows. "
        + "Use this to study an existing journey before proposing a related one.",
      inputSchema: z.object({
        id: z.string().min(1).max(64),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const definitions = await listAllWorkflowDefinitions();
      const definition = definitions.find((entry) => entry.id === id);

      if (!definition) {
        return {
          isError: true,
          content: [{ type: "text", text: `No workflow with id ${id}. Use list_workflows first.` }],
        };
      }

      const steps = definition.nodes
        .filter((node) => node.type !== "case-complete")
        .map((node) => ({
          title: node.title.en,
          detail: node.detail.en,
          kind: node.link ? "website" : node.visit ? "visit" : node.verify ? "desk" : "confirm",
          ...(node.link ? { url: node.link.url } : {}),
        }));

      return {
        content: [{ type: "text", text: steps.map((step, i) => `${i + 1}. ${step.title} — ${step.detail}`).join("\n") }],
        structuredContent: { id: definition.id, title: definition.title.en, steps },
      };
    },
  );

  server.registerTool(
    "propose_workflow",
    {
      title: "Propose a workflow",
      description:
        "Add a new citizen journey to Sahayak from a contributor's lived experience. "
        + "Each step must be one of: 'confirm' (ask the citizen and move on), 'visit' (an in-person office trip), 'website' (an action on a public portal — pass its exact https URL), or 'desk' (submit and wait for a desk to reply, with a verification clock). "
        + "The closing case-summary step is added automatically. "
        + "The journey is compiled by Sahayak's deterministic engine — the tool returns a preview link and review suggestions to discuss with the contributor.",
      inputSchema: workflowSpecShape.extend({
        contributorNote: z.string().trim().max(500).optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      const spec = { title: input.title, subtitle: input.subtitle, steps: input.steps };
      await loadCustomWorkflows();

      const taken = new Set([
        ...workflowIds,
        ...(await store.listWorkflows().catch(() => [])).map((row) => row.id),
      ]);
      const id = assignWorkflowId(spec, taken);
      const definition = {
        ...compileWorkflow(spec, id),
        authoredBy: "mcp" as const,
        authoredAt: new Date().toISOString(),
      };

      registerWorkflowDefinition(definition);

      let saved = true;
      try {
        await store.saveWorkflow(definition, id);
      } catch {
        saved = false;
      }

      const flags = reviewFlagsFor(spec);
      const suggestions = suggestionsFor(spec);
      const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      const previewUrl = `${origin}/case-card?workflow=${id}`;

      const lines = [
        `Proposed "${definition.title.en}" with ${input.steps.length} step(s) — id ${id}.`,
        saved ? "It is live on the home screen." : "It is running in this session but could not be saved.",
        previewUrl,
        ...flags.map((flag) => `Review: ${flag}`),
        ...suggestions.map((suggestion) => `Suggestion: ${suggestion}`),
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          workflowId: id,
          title: definition.title.en,
          stepCount: input.steps.length,
          saved,
          previewUrl,
          flags,
          suggestions,
        },
      };
    },
  );

  return server;
}
