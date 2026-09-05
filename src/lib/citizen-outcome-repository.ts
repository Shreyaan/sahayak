import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { citizenCasesTable, citizenOutcomesTable, workflowVersionsTable } from "@/db/schema";
import { store } from "./store";
import { summarizeCitizenOutcomes, type CitizenOutcome, type CitizenOutcomeRepository } from "./citizen-outcomes";

const testOutcomes: CitizenOutcome[] = [];

const postgresRepository: CitizenOutcomeRepository = {
  getCase: (caseId, ownerHash) => store.getCase(caseId, ownerHash),

  async getWorkflowVersion(workflowVersionId) {
    const [version] = await getDatabase().select({
      scope: workflowVersionsTable.scope,
      stateCode: workflowVersionsTable.stateCode,
      districtCode: workflowVersionsTable.districtCode,
    }).from(workflowVersionsTable)
      .where(eq(workflowVersionsTable.id, workflowVersionId))
      .limit(1);
    return version ?? null;
  },

  async appendOutcome(event) {
    await getDatabase().insert(citizenOutcomesTable).values({
      ...event,
      occurredAt: new Date(event.occurredAt),
    });
  },

  async createCaseWithOutcome(record, event) {
    await getDatabase().transaction(async (transaction) => {
      await transaction.insert(citizenCasesTable).values({
        id: record.id,
        workflowId: record.snapshot.workflowId,
        ownerHash: record.ownerHash,
        snapshot: record.snapshot,
      });
      await transaction.insert(citizenOutcomesTable).values({
        ...event,
        occurredAt: new Date(event.occurredAt),
      });
    });
  },

  async listOutcomes(caseId) {
    return (await getDatabase().select().from(citizenOutcomesTable)
      .where(eq(citizenOutcomesTable.caseId, caseId))
      .orderBy(asc(citizenOutcomesTable.occurredAt)))
      .map((row): CitizenOutcome => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
  },

  async summarizeOutcomes() {
    const events = await getDatabase().select({
      caseId: citizenOutcomesTable.caseId,
      kind: citizenOutcomesTable.kind,
      detail: citizenOutcomesTable.detail,
    }).from(citizenOutcomesTable);
    return summarizeCitizenOutcomes(events);
  },
};

const testRepository: CitizenOutcomeRepository = {
  getCase: (caseId, ownerHash) => store.getCase(caseId, ownerHash),
  getWorkflowVersion: postgresRepository.getWorkflowVersion,
  async createCaseWithOutcome(record, event) {
    await store.saveCase(record.id, record.snapshot, record.ownerHash);
    testOutcomes.push(event);
  },
  async appendOutcome(event) { testOutcomes.push(event); },
  async listOutcomes(caseId) { return testOutcomes.filter((event) => event.caseId === caseId); },
  async summarizeOutcomes() { return summarizeCitizenOutcomes(testOutcomes); },
};

export const citizenOutcomeRepository = process.env.NODE_ENV === "test"
  ? testRepository
  : postgresRepository;
