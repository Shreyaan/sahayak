import { and, desc, eq, sql } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { getDatabase } from "@/db/client";
import {
  citizenCasesTable,
  contributorSubmissionsTable,
  legacyWorkflowDefinitionsTable,
} from "@/db/schema";
import type { CaseSnapshot } from "./workflow";
import type { ArtifactDraft } from "./artifact-drafts";

/**
 * One storage seam for everything that must outlive a page reload: citizen
 * cases, contributor submissions, and user-added workflows. Backed by Postgres
 * in production and development. The in-memory implementation is an explicit
 * test fixture only; runtime code fails closed when PostgreSQL is unavailable.
 */

export type StoredCase = {
  id: string;
  workflowId: string;
  snapshot: CaseSnapshot;
  updatedAt: string;
};

export type StoredSubmission = {
  id: number;
  createdAt: string;
  workflowId: string;
  input: string;
  draft: unknown;
};

export type StoredWorkflow = {
  id: string;
  definition: unknown;
  createdAt: string;
};

export type Store = {
  saveCase(id: string, snapshot: CaseSnapshot, ownerHash?: string): Promise<void>;
  saveCaseProgress(id: string, snapshot: CaseSnapshot, ownerHash: string | undefined, expectedSnapshot: CaseSnapshot): Promise<void>;
  saveArtifactDraft(id: string, draft: ArtifactDraft, ownerHash?: string): Promise<void>;
  getCase(id: string, ownerHash?: string): Promise<StoredCase | null>;
  listCases(limit: number, ownerHash?: string): Promise<StoredCase[]>;
  saveSubmission(submission: Omit<StoredSubmission, "id" | "createdAt">): Promise<void>;
  listSubmissions(limit: number): Promise<StoredSubmission[]>;
  saveWorkflow(definition: unknown, id: string): Promise<void>;
  listWorkflows(): Promise<StoredWorkflow[]>;
};

const memory = {
  cases: new Map<string, StoredCase & { ownerHash: string | null }>(),
  submissions: [] as StoredSubmission[],
  workflows: new Map<string, StoredWorkflow>(),
};

/** Strictly increasing timestamps, so "newest first" is unambiguous in memory. */
let lastMemoryTime = 0;

function memoryTime(): string {
  let now = Date.now();
  if (now <= lastMemoryTime) now = lastMemoryTime + 1;
  lastMemoryTime = now;
  return new Date(now).toISOString();
}

const memoryStore: Store = {
  async saveCase(id, snapshot, ownerHash) {
    const existing = memory.cases.get(id);
    memory.cases.set(id, {
      id,
      workflowId: snapshot.workflowId,
      snapshot,
      updatedAt: memoryTime(),
      ownerHash: existing?.ownerHash ?? ownerHash ?? null,
    });
  },
  async saveCaseProgress(id, snapshot, ownerHash, expectedSnapshot) {
    const existing = memory.cases.get(id);
    if (!existing || (ownerHash && existing.ownerHash !== ownerHash)) throw new Error("CASE_NOT_FOUND");
    const { artifactDrafts: _savedDrafts, ...savedProgress } = existing.snapshot;
    const { artifactDrafts: _expectedDrafts, ...expectedProgress } = expectedSnapshot;
    if (!isDeepStrictEqual(savedProgress, expectedProgress)) throw new Error("CASE_CONFLICT");
    memory.cases.set(id, {
      ...existing,
      workflowId: snapshot.workflowId,
      snapshot: {
        ...snapshot,
        artifactDrafts: existing.snapshot.artifactDrafts,
      },
      updatedAt: memoryTime(),
    });
  },
  async saveArtifactDraft(id, draft, ownerHash) {
    const existing = memory.cases.get(id);
    if (!existing || (ownerHash && existing.ownerHash !== ownerHash)) throw new Error("CASE_NOT_FOUND");
    memory.cases.set(id, {
      ...existing,
      snapshot: {
        ...existing.snapshot,
        artifactDrafts: { ...existing.snapshot.artifactDrafts, "escalation-draft": draft },
      },
      updatedAt: memoryTime(),
    });
  },
  async listCases(limit, ownerHash) {
    return [...memory.cases.values()]
      .filter((entry) => !ownerHash || entry.ownerHash === ownerHash)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(({ ownerHash: _ownerHash, ...entry }) => entry);
  },
  async getCase(id, ownerHash) {
    const record = memory.cases.get(id);
    if (!record || (ownerHash && record.ownerHash !== ownerHash)) return null;
    const { ownerHash: _ownerHash, ...result } = record;
    return result;
  },
  async saveSubmission(submission) {
    memory.submissions.push({
      ...submission,
      id: memory.submissions.length + 1,
      createdAt: memoryTime(),
    });
  },
  async listSubmissions(limit) {
    return [...memory.submissions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },
  async saveWorkflow(definition, id) {
    memory.workflows.set(id, {
      id,
      definition,
      createdAt: new Date().toISOString(),
    });
  },
  async listWorkflows() {
    return [...memory.workflows.values()];
  },
};

function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  return url && url.trim() ? url : null;
}

export const postgresStore: Store = {
  async saveCase(id, snapshot, ownerHash) {
    await getDatabase().insert(citizenCasesTable).values({
      id,
      workflowId: snapshot.workflowId,
      ownerHash: ownerHash ?? null,
      snapshot,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: citizenCasesTable.id,
      set: { workflowId: snapshot.workflowId, snapshot, updatedAt: new Date() },
    });
  },
  async saveCaseProgress(id, snapshot, ownerHash, expectedSnapshot) {
    const ownership = ownerHash
      ? and(eq(citizenCasesTable.id, id), eq(citizenCasesTable.ownerHash, ownerHash))
      : eq(citizenCasesTable.id, id);
    // Compare and write in one SQL statement. Draft edits have their own atomic
    // write and must neither invalidate progress nor be overwritten by it.
    const condition = and(ownership, sql`(${citizenCasesTable.snapshot} - 'artifactDrafts') = (${JSON.stringify(expectedSnapshot)}::jsonb - 'artifactDrafts')`);
    const snapshotJson = JSON.stringify(snapshot);
    const rows = await getDatabase().update(citizenCasesTable).set({
      workflowId: snapshot.workflowId,
      snapshot: sql<CaseSnapshot>`
        (${snapshotJson}::jsonb - 'artifactDrafts')
        || case
          when ${citizenCasesTable.snapshot} ? 'artifactDrafts'
          then jsonb_build_object('artifactDrafts', ${citizenCasesTable.snapshot}->'artifactDrafts')
          else '{}'::jsonb
        end
      `,
      updatedAt: new Date(),
    }).where(condition).returning({ id: citizenCasesTable.id });
    if (rows.length === 0) throw new Error("CASE_CONFLICT");
  },
  async saveArtifactDraft(id, draft, ownerHash) {
    const condition = ownerHash
      ? and(eq(citizenCasesTable.id, id), eq(citizenCasesTable.ownerHash, ownerHash))
      : eq(citizenCasesTable.id, id);
    const draftJson = JSON.stringify(draft);
    const rows = await getDatabase().update(citizenCasesTable).set({
      snapshot: sql<CaseSnapshot>`jsonb_set(
        ${citizenCasesTable.snapshot},
        '{artifactDrafts}',
        coalesce(${citizenCasesTable.snapshot}->'artifactDrafts', '{}'::jsonb)
          || jsonb_build_object('escalation-draft', ${draftJson}::jsonb),
        true
      )`,
      updatedAt: new Date(),
    }).where(condition).returning({ id: citizenCasesTable.id });
    if (rows.length === 0) throw new Error("CASE_NOT_FOUND");
  },
  async listCases(limit, ownerHash) {
    const query = getDatabase().select().from(citizenCasesTable)
      .orderBy(desc(citizenCasesTable.updatedAt)).limit(limit);
    const rows = ownerHash
      ? await query.where(eq(citizenCasesTable.ownerHash, ownerHash))
      : await query;
    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      snapshot: row.snapshot,
      updatedAt: row.updatedAt.toISOString(),
    }));
  },
  async getCase(id, ownerHash) {
    const condition = ownerHash
      ? and(eq(citizenCasesTable.id, id), eq(citizenCasesTable.ownerHash, ownerHash))
      : eq(citizenCasesTable.id, id);
    const [row] = await getDatabase().select().from(citizenCasesTable)
      .where(condition).limit(1);
    return row ? {
      id: row.id,
      workflowId: row.workflowId,
      snapshot: row.snapshot,
      updatedAt: row.updatedAt.toISOString(),
    } : null;
  },
  async saveSubmission(submission) {
    await getDatabase().insert(contributorSubmissionsTable).values(submission);
  },
  async listSubmissions(limit) {
    return (await getDatabase().select().from(contributorSubmissionsTable)
      .orderBy(desc(contributorSubmissionsTable.createdAt)).limit(limit)).map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      workflowId: row.workflowId,
      input: row.input,
      draft: row.draft,
    }));
  },
  async saveWorkflow(definition, id) {
    await getDatabase().insert(legacyWorkflowDefinitionsTable).values({ id, definition })
      .onConflictDoUpdate({ target: legacyWorkflowDefinitionsTable.id, set: { definition } });
  },
  async listWorkflows() {
    return (await getDatabase().select().from(legacyWorkflowDefinitionsTable)
      .orderBy(legacyWorkflowDefinitionsTable.createdAt)).map((row) => ({
      id: row.id,
      definition: row.definition,
      createdAt: row.createdAt.toISOString(),
    }));
  },
};

const unavailableStore: Store = new Proxy({} as Store, {
  get() {
    return async () => { throw new Error("DATABASE_UNAVAILABLE"); };
  },
});

export const store: Store = process.env.NODE_ENV === "test"
  ? memoryStore
  : databaseUrl() ? postgresStore : unavailableStore;

export function resetMemoryStore(): void {
  if (process.env.NODE_ENV !== "test") return;
  memory.cases.clear();
  memory.submissions.length = 0;
  memory.workflows.clear();
}
