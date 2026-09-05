import { describe, expect, test } from "bun:test";
import { createReviewCaseService, type ReviewCaseRepository } from "./review-case-service";
import { workflows } from "./workflow";
import { revisionHash } from "./review-case";

function repository(): ReviewCaseRepository & { rows: any[] } {
  const rows: any[] = [];
  return {
    rows,
    async create(input) {
      const row = {
        id: input.id,
        sourceChannel: input.sourceChannel,
        status: input.status,
        submittedTitle: input.submittedTitle,
        evidence: input.evidence,
        jurisdiction: input.jurisdiction,
        baselineWorkflowVersionId: null,
        currentRevision: { ...input.revision, createdAt: "2026-09-05T00:00:00.000Z" },
        createdAt: "2026-09-05T00:00:00.000Z",
        updatedAt: "2026-09-05T00:00:00.000Z",
      };
      rows.push(row);
      return row;
    },
    async list(filters) {
      return rows.filter((row) => (!filters.status || row.status === filters.status) && (!filters.scope || row.jurisdiction.scope === filters.scope));
    },
    async get(id) { return rows.find((row) => row.id === id) ?? null; },
    async saveRevision(input) {
      const row = rows.find((candidate) => candidate.id === input.caseId);
      if (!row) throw new Error("REVIEW_CASE_NOT_FOUND");
      if (row.currentRevision.contentHash !== input.expectedHash) throw new Error("STALE_REVISION");
      if (revisionHash(input.content) === row.currentRevision.contentHash) return row;
      row.currentRevision = { id: crypto.randomUUID(), revision: row.currentRevision.revision + 1, contentHash: revisionHash(input.content), content: input.content, editorId: input.editorId, createdAt: "2026-09-05T00:00:01.000Z" };
      return row;
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

const submission = {
  submittedTitle: "Scholarship for 9876543210",
  input: "Call me on 9876543210; my account is 1234 5678 9012.",
  jurisdiction: { scope: "district" as const, stateCode: "UP", districtCode: "LKO" },
  draft: {
    workflowId: "scholarship", definition: structuredClone(workflows.scholarship),
    title: { hi: "मसौदा", en: "Draft" }, summary: { hi: "सार", en: "Summary" },
    steps: [{ hi: "पहला कदम", en: "First step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience" as const,
  },
};

describe("review case service", () => {
  test("creates a draft case with one immutable revision and redacted evidence", async () => {
    const service = createReviewCaseService(repository());
    const created = await service.create(submission);

    expect(created.status).toBe("draft");
    expect(created.currentRevision.revision).toBe(1);
    expect(created.currentRevision.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.submittedTitle).toBe("Scholarship for [phone]");
    expect(created.evidence).toBe("Call me on [phone]; my account is [id].");
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("filters the review queue and retrieves the exact current revision", async () => {
    const repo = repository();
    const service = createReviewCaseService(repo);
    const first = await service.create(submission);
    await service.create({ ...submission, jurisdiction: { scope: "central" }, input: "Another experience" });

    expect((await service.list({ scope: "district" })).map((row) => row.id)).toEqual([first.id]);
    expect((await service.get(first.id))?.currentRevision.content.title.en).toBe("Draft");
  });
});
