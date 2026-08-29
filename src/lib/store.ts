import postgres, { type JSONValue } from "postgres";
import type { CaseSnapshot } from "./workflow";

/**
 * One storage seam for everything that must outlive a page reload: citizen
 * cases, contributor submissions, and user-added workflows. Backed by Postgres
 * when DATABASE_URL is configured; otherwise a per-process memory store, so
 * development, tests, and a keyless deployment all keep working unchanged.
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
  saveCase(id: string, snapshot: CaseSnapshot): Promise<void>;
  listCases(limit: number): Promise<StoredCase[]>;
  saveSubmission(submission: Omit<StoredSubmission, "id" | "createdAt">): Promise<void>;
  listSubmissions(limit: number): Promise<StoredSubmission[]>;
  saveWorkflow(definition: unknown, id: string): Promise<void>;
  listWorkflows(): Promise<StoredWorkflow[]>;
};

const memory = {
  cases: new Map<string, StoredCase>(),
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
  async saveCase(id, snapshot) {
    memory.cases.set(id, {
      id,
      workflowId: snapshot.workflowId,
      snapshot,
      updatedAt: memoryTime(),
    });
  },
  async listCases(limit) {
    return [...memory.cases.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
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

let sql: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

function databaseUrl(): string | null {
  const url = process.env.DATABASE_URL;
  return url && url.trim() ? url : null;
}

function client(): ReturnType<typeof postgres> {
  if (!sql) {
    sql = postgres(databaseUrl()!, { max: 5, idle_timeout: 20 });
    schemaReady = (async () => {
      await sql!`CREATE TABLE IF NOT EXISTS sahayak_cases (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        snapshot JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql!`CREATE TABLE IF NOT EXISTS sahayak_submissions (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        workflow_id TEXT NOT NULL,
        input TEXT NOT NULL,
        draft JSONB NOT NULL
      )`;
      await sql!`CREATE TABLE IF NOT EXISTS sahayak_workflows (
        id TEXT PRIMARY KEY,
        definition JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })();
  }
  return sql;
}

const pgStore: Store = {
  async saveCase(id, snapshot) {
    const db = client();
    await schemaReady;
    await db`
      INSERT INTO sahayak_cases (id, workflow_id, snapshot, updated_at)
      VALUES (${id}, ${snapshot.workflowId}, ${db.json(snapshot)}, now())
      ON CONFLICT (id) DO UPDATE
      SET snapshot = EXCLUDED.snapshot, workflow_id = EXCLUDED.workflow_id, updated_at = now()
    `;
  },
  async listCases(limit) {
    const db = client();
    await schemaReady;
    return (await db`
      SELECT id, workflow_id, snapshot, updated_at FROM sahayak_cases
      ORDER BY updated_at DESC LIMIT ${limit}
    `).map((row) => ({
      id: row.id,
      workflowId: row.workflow_id,
      snapshot: row.snapshot as CaseSnapshot,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  },
  async saveSubmission(submission) {
    const db = client();
    await schemaReady;
    await db`
      INSERT INTO sahayak_submissions (workflow_id, input, draft)
      VALUES (${submission.workflowId}, ${submission.input}, ${db.json(submission.draft as JSONValue)})
    `;
  },
  async listSubmissions(limit) {
    const db = client();
    await schemaReady;
    return (await db`
      SELECT id, created_at, workflow_id, input, draft FROM sahayak_submissions
      ORDER BY created_at DESC LIMIT ${limit}
    `).map((row) => ({
      id: Number(row.id),
      createdAt: new Date(row.created_at).toISOString(),
      workflowId: row.workflow_id,
      input: row.input,
      draft: row.draft,
    }));
  },
  async saveWorkflow(definition, id) {
    const db = client();
    await schemaReady;
    await db`
      INSERT INTO sahayak_workflows (id, definition)
      VALUES (${id}, ${db.json(definition as JSONValue)})
      ON CONFLICT (id) DO UPDATE SET definition = EXCLUDED.definition
    `;
  },
  async listWorkflows() {
    const db = client();
    await schemaReady;
    return (await db`
      SELECT id, definition, created_at FROM sahayak_workflows ORDER BY created_at ASC
    `).map((row) => ({
      id: row.id,
      definition: row.definition,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  },
};

export const store: Store = databaseUrl() ? pgStore : memoryStore;

export function resetMemoryStore(): void {
  if (databaseUrl()) return;
  memory.cases.clear();
  memory.submissions.length = 0;
  memory.workflows.clear();
}
