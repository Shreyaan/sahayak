import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { searchWorkflows } from "@/lib/search/search-workflows";
import { getPublishedWorkflowVersion } from "@/lib/workflow-version";
import { compileGeneratedContribution, generatedContributionSchema } from "@/lib/contribution";
import { resolveJurisdiction } from "@/lib/india-locations";
import { reviewCaseService } from "@/lib/review-case-service-instance";

/** Thin MCP adapter over shared published retrieval and review-case services. */
export function buildSahayakMcpServer(): McpServer {
  const server = new McpServer(
    { name: "sahayak", version: "1.0.0" },
    { instructions: "Search published journeys or submit a structured bilingual proposal for expert review. Proposals never become published guidance automatically." },
  );

  server.registerTool(
    "search_workflows",
    {
      title: "Search published journeys",
      description: "Find applicable published journeys using Sahayak's shared retrieval service.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(500),
        locale: z.enum(["hi", "en"]).default("en"),
        stateCode: z.string().trim().min(1).max(16).optional(),
        districtCode: z.string().trim().min(1).max(16).optional(),
      }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const result = await searchWorkflows({ ...input, limit: 3 });
        return {
          content: [{
            type: "text",
            text: result.results.length
              ? result.results.map((item) => `${item.title} (${item.workflowVersionId})${item.requiresConfirmation ? " — related option only; ask the citizen to confirm fit before starting" : ""}`).join("\n")
              : "No safe published match. Ask the citizen for one more detail.",
          }],
          structuredContent: result,
        };
      } catch {
        return { isError: true, content: [{ type: "text", text: "Published journey search is unavailable." }] };
      }
    },
  );

  server.registerTool(
    "propose_workflow",
    {
      title: "Propose a workflow for expert review",
      description: "Use your AI reasoning to submit a complete bilingual workflow draft. This creates an unpublished Review Case only.",
      inputSchema: z.object({
        evidence: z.string().trim().min(1).max(2_000),
        confirmed: z.literal(true).describe("The user has reviewed and approved submitting this draft."),
        draft: generatedContributionSchema,
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ evidence, draft }) => {
      try {
        const compiled = compileGeneratedContribution(draft);
        const review = await reviewCaseService.create({
          input: evidence,
          jurisdiction: resolveJurisdiction(draft.jurisdiction),
          draft: compiled,
          sourceChannel: "mcp",
        });
        return {
          content: [{ type: "text", text: `Submitted for expert review: ${review.id}. It is not published or searchable.` }],
          structuredContent: { reviewCaseId: review.id, reviewUrl: `/admin/reviews/${encodeURIComponent(review.id)}`, status: "draft" },
        };
      } catch {
        return { isError: true, content: [{ type: "text", text: "The proposed workflow or jurisdiction is invalid, or review storage is unavailable." }] };
      }
    },
  );

  server.registerTool(
    "get_workflow",
    {
      title: "Get a published journey version",
      description: "Get one exact published journey version returned by search_workflows.",
      inputSchema: z.object({ workflowVersionId: z.string().trim().min(1).max(128) }).strict(),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workflowVersionId }) => {
      try {
        const version = await getPublishedWorkflowVersion(workflowVersionId);
        if (!version) {
          return { isError: true, content: [{ type: "text", text: "That published workflow version was not found." }] };
        }

        const steps = version.definition.nodes
          .filter((node) => node.type !== "case-complete")
          .map((node) => ({ id: node.id, title: node.title, detail: node.detail }));
        return {
          content: [{ type: "text", text: steps.map((step, index) => `${index + 1}. ${step.title.en} — ${step.detail.en}`).join("\n") }],
          structuredContent: {
            workflowId: version.workflowId,
            workflowVersionId: version.id,
            version: version.version,
            title: version.definition.title,
            steps,
            trust: version.trust,
          },
        };
      } catch {
        return { isError: true, content: [{ type: "text", text: "Published journey lookup is unavailable." }] };
      }
    },
  );

  return server;
}
