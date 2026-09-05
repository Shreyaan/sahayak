import { z } from "zod";
import type { Localized } from "./locale";
import type { WorkflowDefinition, WorkflowNode } from "./workflow";

const localizedSchema = z.object({
  hi: z.string().trim().min(1).max(2_000),
  en: z.string().trim().min(1).max(2_000),
}).strict();

export const wordingEditSchema = z.object({
  title: localizedSchema,
  subtitle: localizedSchema,
  nodes: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    title: localizedSchema,
    detail: localizedSchema,
    ask: localizedSchema,
  }).strict()).min(1).max(20),
}).strict();

export type WordingEdit = z.infer<typeof wordingEditSchema>;
export type ComparisonStatus = "same" | "changed" | "added" | "missing";
export type WorkflowComparisonRow = {
  proposedNodeId: string;
  baselineNodeId: string | null;
  status: ComparisonStatus;
  proposed: Pick<WorkflowNode, "title" | "detail"> | null;
  baseline: Pick<WorkflowNode, "title" | "detail"> | null;
};

function wordingEqual(left: Localized, right: Localized): boolean {
  return left.hi.trim() === right.hi.trim() && left.en.trim() === right.en.trim();
}

function normalized(node: WorkflowNode): Set<string> {
  return `${node.title.en} ${node.title.hi} ${node.detail.en} ${node.detail.hi}`
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean)
    .reduce((tokens, token) => tokens.add(token), new Set<string>());
}

function similar(left: WorkflowNode, right: WorkflowNode): boolean {
  const leftTokens = normalized(left);
  const rightTokens = normalized(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection > 0 && intersection / Math.max(leftTokens.size, rightTokens.size) >= 0.5;
}

/** Aligns IDs first, then only genuinely similar remaining wording, then reports omissions. */
export function compareWorkflowDefinitions(proposed: WorkflowDefinition, baseline: WorkflowDefinition): WorkflowComparisonRow[] {
  const baselineById = new Map(baseline.nodes.map((node) => [node.id, node]));
  const matchedBaselineIds = new Set(proposed.nodes.filter((node) => baselineById.has(node.id)).map((node) => node.id));
  const remainingBaseline = baseline.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => !matchedBaselineIds.has(node.id));
  const rows: Array<WorkflowComparisonRow | undefined> = [];
  const unmatchedProposed: Array<{ node: WorkflowNode; index: number }> = [];

  for (const [proposedIndex, node] of proposed.nodes.entries()) {
    const byId = baselineById.get(node.id);
    if (byId) {
      rows[proposedIndex] = {
        proposedNodeId: node.id, baselineNodeId: byId.id,
        status: wordingEqual(node.title, byId.title) && wordingEqual(node.detail, byId.detail) ? "same" : "changed",
        proposed: { title: node.title, detail: node.detail }, baseline: { title: byId.title, detail: byId.detail },
      };
      continue;
    }
    unmatchedProposed.push({ node, index: proposedIndex });
  }
  const stillUnmatched: Array<{ node: WorkflowNode; index: number }> = [];
  for (const item of unmatchedProposed) {
    const similarIndex = remainingBaseline.findIndex((candidate) => similar(item.node, candidate.node));
    if (similarIndex < 0) {
      stillUnmatched.push(item);
      continue;
    }
    const matched = remainingBaseline.splice(similarIndex, 1)[0]!.node;
    rows[item.index] = {
      proposedNodeId: item.node.id, baselineNodeId: matched.id,
      status: wordingEqual(item.node.title, matched.title) && wordingEqual(item.node.detail, matched.detail) ? "same" : "changed",
      proposed: { title: item.node.title, detail: item.node.detail }, baseline: { title: matched.title, detail: matched.detail },
    };
  }
  for (const item of stillUnmatched) {
    const matched = remainingBaseline.shift()?.node;
    rows[item.index] = {
      proposedNodeId: item.node.id, baselineNodeId: matched?.id ?? null,
      status: matched ? "changed" : "added",
      proposed: { title: item.node.title, detail: item.node.detail },
      baseline: matched ? { title: matched.title, detail: matched.detail } : null,
    };
  }
  const completeRows = rows.filter((row): row is WorkflowComparisonRow => Boolean(row));
  for (const { node } of remainingBaseline) {
    completeRows.push({ proposedNodeId: node.id, baselineNodeId: node.id, status: "missing", proposed: null, baseline: { title: node.title, detail: node.detail } });
  }
  return completeRows;
}

/** Rebuilds the stored definition from an exhaustive, wording-only payload. */
export function applyWordingEdit(definition: WorkflowDefinition, input: WordingEdit): WorkflowDefinition {
  const wording = wordingEditSchema.safeParse(input);
  if (!wording.success || wording.data.nodes.length !== definition.nodes.length) throw new Error("INVALID_WORDING_EDIT");
  const byId = new Map(wording.data.nodes.map((node) => [node.id, node]));
  if (byId.size !== definition.nodes.length || definition.nodes.some((node) => !byId.has(node.id))) throw new Error("INVALID_WORDING_EDIT");
  return {
    ...definition,
    title: wording.data.title,
    subtitle: wording.data.subtitle,
    nodes: definition.nodes.map((node) => {
      const changed = byId.get(node.id)!;
      return { ...node, title: changed.title, detail: changed.detail, ask: changed.ask };
    }),
  };
}
