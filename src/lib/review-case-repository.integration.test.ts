import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { reviewCasesTable, reviewRevisionsTable } from "@/db/schema";
import { createPostgresReviewCaseRepository } from "./review-case-repository";
import { createReviewCaseService } from "./review-case-service";
import { workflows } from "./workflow";

const workflowDraft = { workflowId: "scholarship", definition: structuredClone(workflows.scholarship), title: structuredClone(workflows.scholarship.title), summary: structuredClone(workflows.scholarship.subtitle), steps: workflows.scholarship.nodes.map((node) => structuredClone(node.title)), matches: [], additions: [], conflicts: [], sourceType: "lived experience" as const };

const ids: string[] = [];
afterEach(async () => {
  for (const id of ids.splice(0)) {
    await getDatabase().delete(reviewRevisionsTable).where(eq(reviewRevisionsTable.caseId, id));
    await getDatabase().delete(reviewCasesTable).where(eq(reviewCasesTable.id, id));
  }
});

describe("PostgreSQL review case repository", () => {
  test("persists a redacted case and its exact initial revision transactionally", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const created = await service.create({
      input: "Phone 9876543210, account 1234 5678 9012", jurisdiction: { scope: "state", stateCode: "UP" },
      draft: workflowDraft,
    });
    ids.push(created.id);

    const loaded = await service.get(created.id);
    expect(loaded?.evidence).toBe("Phone [phone], account [id]");
    expect(loaded?.currentRevision.id).toBe(created.currentRevision.id);
    expect(loaded?.currentRevision.contentHash).toBe(created.currentRevision.contentHash);
  });

  test("filters multiple rows and rejects cross-case pointers or stale hashes", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const draft = workflowDraft;
    const state = await service.create({ input: "State experience", jurisdiction: { scope: "state", stateCode: "UP" }, draft });
    const central = await service.create({ input: "Central experience", jurisdiction: { scope: "central" }, draft });
    ids.push(state.id, central.id);
    expect((await service.list({ scope: "state" })).map((row) => row.id)).toEqual([state.id]);

    await getDatabase().update(reviewCasesTable).set({ currentRevisionId: central.currentRevision.id }).where(eq(reviewCasesTable.id, state.id));
    await expect(service.get(state.id)).rejects.toThrow("REVIEW_CASE_INVALID_DATA");

    await getDatabase().update(reviewCasesTable).set({ currentRevisionId: state.currentRevision.id, currentRevisionHash: "0".repeat(64) }).where(eq(reviewCasesTable.id, state.id));
    await expect(service.list({ scope: "state" })).rejects.toThrow("REVIEW_CASE_INVALID_DATA");
  });

  test("keeps a pre-0009 wording-only revision unavailable without corrupting its pointer", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const created = await service.create({ input: "Legacy scholarship experience", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(created.id);
    const legacyContent = { title: { hi: "पुराना", en: "Legacy" }, summary: { hi: "सार", en: "Summary" }, steps: [{ hi: "कदम", en: "Step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience" };
    await getDatabase().update(reviewRevisionsTable).set({ content: legacyContent as any }).where(eq(reviewRevisionsTable.id, created.currentRevision.id));

    await expect(service.get(created.id)).rejects.toThrow("REVIEW_CASE_INVALID_DATA");
  });

  test("omits an unavailable legacy row from the queue while retaining valid drafts", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const legacy = await service.create({ input: "Legacy queue row", jurisdiction: { scope: "central" }, draft: workflowDraft });
    const valid = await service.create({ input: "Valid queue row", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(legacy.id, valid.id);
    await getDatabase().update(reviewRevisionsTable).set({ content: { title: { hi: "पुराना", en: "Legacy" }, summary: { hi: "सार", en: "Summary" }, steps: [{ hi: "कदम", en: "Step" }], matches: [], additions: [], conflicts: [], sourceType: "lived experience" } as any }).where(eq(reviewRevisionsTable.id, legacy.currentRevision.id));

    expect((await service.list({ scope: "central" })).map((row) => row.id)).toContain(valid.id);
    expect((await service.list({ scope: "central" })).map((row) => row.id)).not.toContain(legacy.id);
    await expect(service.get(legacy.id)).rejects.toThrow("REVIEW_CASE_INVALID_DATA");
  });

  test("rejects the queue when a modern full-shaped revision is corrupted", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const created = await service.create({ input: "Corrupt modern row", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(created.id);
    const corrupted = structuredClone(created.currentRevision.content);
    corrupted.definition.nodes[0]!.onConfirm.resolves = "missing-node";
    await getDatabase().update(reviewRevisionsTable).set({ content: corrupted as any }).where(eq(reviewRevisionsTable.id, created.currentRevision.id));

    await expect(service.list({ scope: "central" })).rejects.toThrow("REVIEW_CASE_INVALID_DATA");
  });

  test("rechecks a no-op save under the row lock when a case closes concurrently", async () => {
    const base = createPostgresReviewCaseRepository();
    const createService = createReviewCaseService(base);
    const created = await createService.create({ input: "Concurrent closure", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(created.id);
    let firstRead = true;
    const racing = createReviewCaseService({
      ...base,
      async get(id) {
        const current = await base.get(id);
        if (firstRead && current) {
          firstRead = false;
          await getDatabase().update(reviewCasesTable).set({ status: "published" }).where(eq(reviewCasesTable.id, id));
        }
        return current;
      },
    });
    const wording = { title: created.currentRevision.content.definition.title, subtitle: created.currentRevision.content.definition.subtitle, nodes: created.currentRevision.content.definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })) };

    await expect(racing.saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording, editorId: "expert-1" })).rejects.toThrow("REVIEW_CASE_READ_ONLY");
  });

  test("rechecks a no-op save under the row lock when the revision changes concurrently", async () => {
    const base = createPostgresReviewCaseRepository();
    const createService = createReviewCaseService(base);
    const created = await createService.create({ input: "Concurrent revision", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(created.id);
    let firstRead = true;
    const racing = createReviewCaseService({
      ...base,
      async get(id) {
        const current = await base.get(id);
        if (firstRead && current) {
          firstRead = false;
          const content = structuredClone(current.currentRevision.content);
          content.definition.title.en = "Other expert wording";
          content.title = content.definition.title;
          await base.saveRevision({ caseId: id, expectedHash: current.currentRevision.contentHash, content, editorId: "expert-2" });
        }
        return current;
      },
    });
    const wording = { title: created.currentRevision.content.definition.title, subtitle: created.currentRevision.content.definition.subtitle, nodes: created.currentRevision.content.definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })) };

    await expect(racing.saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording, editorId: "expert-1" })).rejects.toThrow("STALE_REVISION");
  });

  test("enforces published baselines and transactional immutable wording revisions", async () => {
    const service = createReviewCaseService(createPostgresReviewCaseRepository());
    const created = await service.create({ input: "Review scholarship wording", jurisdiction: { scope: "central" }, draft: workflowDraft });
    ids.push(created.id);
    await expect(service.selectBaseline({ caseId: created.id, baselineWorkflowVersionId: "not-published" })).rejects.toThrow("BASELINE_NOT_PUBLISHED");
    const selected = await service.selectBaseline({ caseId: created.id, baselineWorkflowVersionId: "scholarship-v1" });
    expect(selected.baselineWorkflowVersionId).toBe("scholarship-v1");

    const wording = { title: created.currentRevision.content.definition.title, subtitle: created.currentRevision.content.definition.subtitle, nodes: created.currentRevision.content.definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })) };
    const before = await getDatabase().select().from(reviewRevisionsTable).where(eq(reviewRevisionsTable.caseId, created.id));
    const unchanged = await service.saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording, editorId: "expert-1" });
    expect(unchanged.currentRevision.id).toBe(created.currentRevision.id);
    expect((await getDatabase().select().from(reviewRevisionsTable).where(eq(reviewRevisionsTable.caseId, created.id))).length).toBe(before.length);

    const changed = await service.saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording: { ...wording, title: { ...wording.title, en: "Reviewed scholarship wording" } }, editorId: "expert-1" });
    expect(changed.currentRevision.revision).toBe(2);
    expect(changed.currentRevision.contentHash).not.toBe(created.currentRevision.contentHash);
    expect((await service.get(created.id))?.currentRevision.contentHash).toBe(changed.currentRevision.contentHash);
    await expect(service.saveWording({ caseId: created.id, expectedHash: created.currentRevision.contentHash, wording, editorId: "expert-2" })).rejects.toThrow("STALE_REVISION");

    await getDatabase().update(reviewCasesTable).set({ status: "published" }).where(eq(reviewCasesTable.id, created.id));
    await expect(service.saveWording({ caseId: created.id, expectedHash: changed.currentRevision.contentHash, wording, editorId: "expert-1" })).rejects.toThrow("REVIEW_CASE_READ_ONLY");
  });
});
