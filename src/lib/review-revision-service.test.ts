import { describe, expect, test } from "bun:test";
import { workflows } from "./workflow";
import { createReviewCaseService, type ReviewCaseRepository } from "./review-case-service";
import { revisionHash } from "./review-case";

function repository(): ReviewCaseRepository & { rows: any[] } {
  const rows: any[] = [];
  return {
    rows,
    async create(input) {
      const row = { ...input, baselineWorkflowVersionId: null, currentRevision: { ...input.revision, createdAt: "2026-09-05T00:00:00.000Z" }, createdAt: "2026-09-05T00:00:00.000Z", updatedAt: "2026-09-05T00:00:00.000Z" };
      rows.push(row);
      return row;
    },
    async list() { return rows; },
    async get(id) { return rows.find((row) => row.id === id) ?? null; },
    async saveRevision(input) {
      const index = rows.findIndex((candidate) => candidate.id === input.caseId);
      const row = rows[index];
      if (!row) throw new Error("REVIEW_CASE_NOT_FOUND");
      if (row.currentRevision.contentHash !== input.expectedHash) throw new Error("STALE_REVISION");
      if (revisionHash(input.content) === row.currentRevision.contentHash) return row;
      const updated = { ...row, currentRevision: { id: crypto.randomUUID(), revision: row.currentRevision.revision + 1, contentHash: revisionHash(input.content), content: input.content, editorId: input.editorId, createdAt: "2026-09-05T00:00:01.000Z" } };
      rows[index] = updated;
      return updated;
    },
    async selectBaseline(caseId, baselineWorkflowVersionId) {
      const row = rows.find((candidate) => candidate.id === caseId);
      if (!row) throw new Error("REVIEW_CASE_NOT_FOUND");
      row.baselineWorkflowVersionId = baselineWorkflowVersionId;
      return row;
    },
    async getPublishedWorkflowVersion() { return null; },
  };
}

const draft = {
  workflowId: "scholarship",
  definition: structuredClone(workflows.scholarship),
  title: structuredClone(workflows.scholarship.title),
  summary: structuredClone(workflows.scholarship.subtitle),
  steps: workflows.scholarship.nodes.map((node) => structuredClone(node.title)),
  matches: [], additions: [], conflicts: [], sourceType: "lived experience" as const,
};

describe("review revision service", () => {
  test("retains a full shared workflow definition in its first immutable revision", async () => {
    const service = createReviewCaseService(repository());
    const created = await service.create({ input: "My scholarship payment is stuck", jurisdiction: { scope: "central" }, draft });

    expect(created.currentRevision.content.workflowId).toBe("scholarship");
    expect(created.currentRevision.content.definition.nodes.map((node) => node.id)).toEqual(workflows.scholarship.nodes.map((node) => node.id));
    expect(created.currentRevision.content.definition.nodes[0]?.onConfirm).toEqual(workflows.scholarship.nodes[0]?.onConfirm);
  });

  test("keeps a normalized no-op and creates the next immutable revision for changed wording", async () => {
    const repo = repository();
    const service = createReviewCaseService(repo);
    const created = await service.create({ input: "My scholarship payment is stuck", jurisdiction: { scope: "central" }, draft });
    const wording = {
      title: { hi: ` ${draft.definition.title.hi} `, en: ` ${draft.definition.title.en} ` },
      subtitle: draft.definition.subtitle,
      nodes: draft.definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })),
    };

    const unchanged = await (service as any).saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording, editorId: "expert-1" });
    expect(unchanged.currentRevision.id).toBe(created.currentRevision.id);
    expect(repo.rows).toHaveLength(1);

    const changed = await (service as any).saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording: { ...wording, title: { ...wording.title, en: "Expert-reviewed scholarship" } }, editorId: "expert-1" });
    expect(changed.currentRevision.revision).toBe(2);
    expect(changed.currentRevision.contentHash).not.toBe(created.currentRevision.contentHash);
    expect(changed.currentRevision.editorId).toBe("expert-1");
  });

  test("uses the shared search service for up to three published comparison candidates", async () => {
    const calls: unknown[] = [];
    const service = createReviewCaseService(repository(), {
      searchWorkflows: async (input: unknown) => {
        calls.push(input);
        return { results: [{ workflowId: "scholarship", workflowVersionId: "scholarship-v1", title: "Stuck scholarship", summary: "Payment delayed", jurisdiction: { scope: "central" }, matchReasons: [], trust: { provenance: "official-source-reviewed", reviewDate: "2026-09-04", verificationMethod: "seed", currentExpertSupportCount: 0, hasUnresolvedDisagreement: false, sourceLinks: [] } }], needsLocation: false, shouldClarify: false };
      },
    } as any);
    const created = await service.create({ input: "My scholarship payment is stuck", jurisdiction: { scope: "central" }, draft });

    const detail = await (service as any).detail(created.id);
    expect(detail.similar.map((result: any) => result.workflowVersionId)).toEqual(["scholarship-v1"]);
    expect(calls).toEqual([expect.objectContaining({ query: "Stuck scholarship An NSP payment that never arrived", locale: "en", limit: 3 })]);
  });
});
