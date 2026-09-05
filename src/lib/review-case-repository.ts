import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { reviewCasesTable, reviewRevisionsTable, workflowVersionsTable } from "@/db/schema";
import { jurisdictionSchema, legacyWordingOnlyRevisionSchema, reviewRevisionContentSchema, revisionHash } from "./review-case";
import { workflowDefinitionSchema } from "./workflow";
import { parseTrustMetadata } from "./trust";
import type { CreateReviewCase, ReviewCase, ReviewCaseRepository } from "./review-case-service";

function timestamp(value: Date): string {
  return value.toISOString();
}

function mapCase(row: typeof reviewCasesTable.$inferSelect, revision: typeof reviewRevisionsTable.$inferSelect): ReviewCase {
  let content;
  try {
    content = reviewRevisionContentSchema.parse(revision.content);
  } catch {
    if (legacyWordingOnlyRevisionSchema.safeParse(revision.content).success) throw new Error("REVIEW_CASE_LEGACY_UNAVAILABLE");
    throw new Error("REVIEW_CASE_INVALID_DATA");
  }
  if (row.currentRevisionId !== revision.id || row.currentRevisionHash !== revision.contentHash || revisionHash(content) !== revision.contentHash) {
    throw new Error("REVIEW_CASE_INVALID_DATA");
  }
  let jurisdiction;
  try {
    jurisdiction = jurisdictionSchema.parse({
      scope: row.scope,
      ...(row.stateCode ? { stateCode: row.stateCode } : {}),
      ...(row.districtCode ? { districtCode: row.districtCode } : {}),
    });
  } catch {
    throw new Error("REVIEW_CASE_INVALID_DATA");
  }
  return {
    id: row.id, sourceChannel: row.sourceChannel, status: row.status, submittedTitle: row.submittedTitle,
    evidence: row.evidence, jurisdiction,
    baselineWorkflowVersionId: row.baselineWorkflowVersionId,
    currentRevision: {
      id: revision.id, revision: revision.revision, contentHash: revision.contentHash, content,
      createdAt: timestamp(revision.createdAt), editorId: revision.editorId,
    },
    createdAt: timestamp(row.createdAt), updatedAt: timestamp(row.updatedAt),
  };
}

async function find(id: string): Promise<ReviewCase | null> {
  const [result] = await getDatabase().select({ reviewCase: reviewCasesTable, revision: reviewRevisionsTable })
    .from(reviewCasesTable)
    .innerJoin(reviewRevisionsTable, and(eq(reviewCasesTable.currentRevisionId, reviewRevisionsTable.id), eq(reviewCasesTable.id, reviewRevisionsTable.caseId)))
    .where(eq(reviewCasesTable.id, id)).limit(1);
  if (result) return mapCase(result.reviewCase, result.revision);
  const [reviewCase] = await getDatabase().select({ id: reviewCasesTable.id }).from(reviewCasesTable).where(eq(reviewCasesTable.id, id)).limit(1);
  if (reviewCase) throw new Error("REVIEW_CASE_INVALID_DATA");
  return null;
}

const postgresRepository: ReviewCaseRepository = {
  async create(input: CreateReviewCase) {
    const now = new Date();
    await getDatabase().transaction(async (transaction) => {
      await transaction.insert(reviewCasesTable).values({
        id: input.id, sourceChannel: input.sourceChannel, status: input.status,
        scope: input.jurisdiction.scope, stateCode: input.jurisdiction.stateCode ?? null,
        districtCode: input.jurisdiction.districtCode ?? null, submittedTitle: input.submittedTitle,
        evidence: input.evidence,
        baselineWorkflowVersionId: null,
        currentRevisionId: input.revision.id, currentRevisionHash: input.revision.contentHash,
        createdAt: now, updatedAt: now,
      });
      await transaction.insert(reviewRevisionsTable).values({ ...input.revision, caseId: input.id, createdAt: now });
    });
    const reviewCase = await find(input.id);
    if (!reviewCase) throw new Error("REVIEW_CASE_CREATE_FAILED");
    return reviewCase;
  },
  async list(filters) {
    const rows = await getDatabase().select({ id: reviewCasesTable.id })
      .from(reviewCasesTable)
      .where(and(
        filters.status ? eq(reviewCasesTable.status, filters.status) : undefined,
        filters.scope ? eq(reviewCasesTable.scope, filters.scope) : undefined,
      )).orderBy(desc(reviewCasesTable.updatedAt));
    const reviewCases: ReviewCase[] = [];
    for (const { id } of rows) {
      try {
        const reviewCase = await find(id);
        if (!reviewCase) throw new Error("REVIEW_CASE_INVALID_DATA");
        reviewCases.push(reviewCase);
      } catch (error) {
        if (error instanceof Error && error.message === "REVIEW_CASE_LEGACY_UNAVAILABLE") continue;
        throw error;
      }
    }
    return reviewCases;
  },
  async get(id) {
    try {
      return await find(id);
    } catch (error) {
      if (error instanceof Error && error.message === "REVIEW_CASE_LEGACY_UNAVAILABLE") throw new Error("REVIEW_CASE_INVALID_DATA");
      throw error;
    }
  },
  async saveRevision(input) {
    const now = new Date();
    await getDatabase().transaction(async (transaction) => {
      await transaction.execute(sql`select 1 from ${reviewCasesTable} where ${reviewCasesTable.id} = ${input.caseId} for update`);
      const [result] = await transaction.select({ reviewCase: reviewCasesTable, revision: reviewRevisionsTable })
        .from(reviewCasesTable)
        .innerJoin(reviewRevisionsTable, and(eq(reviewCasesTable.currentRevisionId, reviewRevisionsTable.id), eq(reviewCasesTable.id, reviewRevisionsTable.caseId)))
        .where(eq(reviewCasesTable.id, input.caseId)).limit(1);
      if (!result) throw new Error("REVIEW_CASE_NOT_FOUND");
      const current = mapCase(result.reviewCase, result.revision);
      if (current.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
      if (current.currentRevision.contentHash !== input.expectedHash) throw new Error("STALE_REVISION");
      const id = crypto.randomUUID();
      const contentHash = revisionHash(input.content);
      if (contentHash === current.currentRevision.contentHash) return;
      await transaction.insert(reviewRevisionsTable).values({
        id, caseId: input.caseId, revision: current.currentRevision.revision + 1, contentHash, content: input.content,
        editorId: input.editorId, createdAt: now,
      });
      await transaction.update(reviewCasesTable).set({ currentRevisionId: id, currentRevisionHash: contentHash, updatedAt: now })
        .where(eq(reviewCasesTable.id, input.caseId));
    });
    const reviewCase = await find(input.caseId);
    if (!reviewCase) throw new Error("REVIEW_CASE_NOT_FOUND");
    return reviewCase;
  },
  async selectBaseline(caseId, baselineWorkflowVersionId) {
    await getDatabase().transaction(async (transaction) => {
      await transaction.execute(sql`select 1 from ${reviewCasesTable} where ${reviewCasesTable.id} = ${caseId} for update`);
      const [result] = await transaction.select({ reviewCase: reviewCasesTable, revision: reviewRevisionsTable })
        .from(reviewCasesTable)
        .innerJoin(reviewRevisionsTable, and(eq(reviewCasesTable.currentRevisionId, reviewRevisionsTable.id), eq(reviewCasesTable.id, reviewRevisionsTable.caseId)))
        .where(eq(reviewCasesTable.id, caseId)).limit(1);
      if (!result) throw new Error("REVIEW_CASE_NOT_FOUND");
      const reviewCase = mapCase(result.reviewCase, result.revision);
      if (reviewCase.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
      if (baselineWorkflowVersionId) {
        const [published] = await transaction.select({ id: workflowVersionsTable.id }).from(workflowVersionsTable)
          .where(and(eq(workflowVersionsTable.id, baselineWorkflowVersionId), eq(workflowVersionsTable.status, "published"))).limit(1);
        if (!published) throw new Error("BASELINE_NOT_PUBLISHED");
      }
      await transaction.update(reviewCasesTable).set({ baselineWorkflowVersionId, updatedAt: new Date() })
        .where(eq(reviewCasesTable.id, caseId));
    });
    const updated = await find(caseId);
    if (!updated) throw new Error("REVIEW_CASE_NOT_FOUND");
    return updated;
  },
  async getPublishedWorkflowVersion(id) {
    const [version] = await getDatabase().select({ id: workflowVersionsTable.id, workflowId: workflowVersionsTable.workflowId, definition: workflowVersionsTable.definition, trust: workflowVersionsTable.trust })
      .from(workflowVersionsTable).where(and(eq(workflowVersionsTable.id, id), eq(workflowVersionsTable.status, "published"))).limit(1);
    return version ? { ...version, definition: workflowDefinitionSchema.parse(version.definition), trust: parseTrustMetadata(version.trust) } : null;
  },
};

/** Constructed separately for PostgreSQL integration tests; app code uses the singleton below. */
export function createPostgresReviewCaseRepository(): ReviewCaseRepository {
  return postgresRepository;
}

const testCases = new Map<string, ReviewCase>();

const testRepository: ReviewCaseRepository = {
  async create(input) {
    const now = new Date().toISOString();
    const reviewCase: ReviewCase = {
      id: input.id, sourceChannel: input.sourceChannel, status: input.status,
      submittedTitle: input.submittedTitle, evidence: input.evidence,
      jurisdiction: input.jurisdiction, baselineWorkflowVersionId: null,
      currentRevision: { ...input.revision, createdAt: now }, createdAt: now, updatedAt: now,
    };
    testCases.set(reviewCase.id, reviewCase);
    return reviewCase;
  },
  async list(filters) {
    return [...testCases.values()].filter((row) =>
      (!filters.status || row.status === filters.status)
      && (!filters.scope || row.jurisdiction.scope === filters.scope));
  },
  async get(id) { return testCases.get(id) ?? null; },
  async saveRevision(input) {
    const reviewCase = testCases.get(input.caseId);
    if (!reviewCase) throw new Error("REVIEW_CASE_NOT_FOUND");
    if (reviewCase.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
    if (reviewCase.currentRevision.contentHash !== input.expectedHash) throw new Error("STALE_REVISION");
    if (revisionHash(input.content) === reviewCase.currentRevision.contentHash) return reviewCase;
    const now = new Date().toISOString();
    const currentRevision = {
      id: crypto.randomUUID(), revision: reviewCase.currentRevision.revision + 1, contentHash: revisionHash(input.content),
      content: input.content, createdAt: now, editorId: input.editorId,
    };
    const updated = { ...reviewCase, currentRevision, updatedAt: now };
    testCases.set(input.caseId, updated);
    return updated;
  },
  async selectBaseline(caseId, baselineWorkflowVersionId) {
    const reviewCase = testCases.get(caseId);
    if (!reviewCase) throw new Error("REVIEW_CASE_NOT_FOUND");
    if (reviewCase.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
    const updated = { ...reviewCase, baselineWorkflowVersionId, updatedAt: new Date().toISOString() };
    testCases.set(caseId, updated);
    return updated;
  },
  async getPublishedWorkflowVersion() { return null; },
};

export const reviewCaseRepository = process.env.NODE_ENV === "test" ? testRepository : postgresRepository;

/** Explicit fixture cleanup; production never has an in-memory review store. */
export function resetTestReviewCases(): void {
  if (process.env.NODE_ENV === "test") testCases.clear();
}
