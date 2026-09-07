import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { citizenCasesTable } from "@/db/schema";
import { postgresStore } from "./store";
import { applyIntent, recordDeskReport, startCase } from "./workflow";

test("PostgreSQL never acknowledges an overwritten concurrent report", async () => {
  const id = `synthetic-concurrency-${crypto.randomUUID()}`;
  const original = applyIntent(startCase("scholarship"), "affirmative").caseSnapshot;
  await postgresStore.saveCase(id, original, "synthetic-owner");
  try {
    const results = await Promise.allSettled(Array.from({ length: 8 }, async (_, index) => {
      const updated = recordDeskReport(original, {
        optionId: "different", response: `SYNTHETIC report ${index}`, referenceNumber: `SYN-${index}`,
        responseDate: "2026-09-06", recordedAt: "2026-09-06T10:00:00.000Z",
      }).caseSnapshot;
      await postgresStore.saveCaseProgress(id, updated, "synthetic-owner", original);
      return `SYN-${index}`;
    }));
    const saved = await postgresStore.getCase(id, "synthetic-owner");
    const accepted = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    expect(accepted).toHaveLength(1);
    expect(saved?.snapshot.reports?.map(report => report.referenceNumber)).toEqual(accepted);
    for (const result of results) if (result.status === "rejected") expect(result.reason.message).toBe("CASE_CONFLICT");
    expect(await postgresStore.getCase(id, "wrong-owner")).toBeNull();
  } finally {
    await getDatabase().delete(citizenCasesTable).where(eq(citizenCasesTable.id, id));
  }
});

test("PostgreSQL keeps clarification notes on reload and rejects competing stale reports", async () => {
  const id = `synthetic-clarification-${crypto.randomUUID()}`;
  const original = recordDeskReport(startCase("scholarship"), {optionId: "different", response: "Synthetic: scheme closed", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:00:00Z"}).caseSnapshot;
  await postgresStore.saveCase(id, original, "synthetic-owner");
  try {
    const updated = {...original, clarificationNotes: [{text: "Does that apply to my existing payment?", reportRecordedAt: original.reports![0].recordedAt, savedAt: "2026-09-08T10:05:00Z"}]};
    await postgresStore.saveCaseProgress(id, updated, "synthetic-owner", original);
    const stale = recordDeskReport(original, {optionId: "npci-missing", response: "Synthetic later clarification", responseDate: "2026-09-08", recordedAt: "2026-09-08T10:06:00Z"}).caseSnapshot;
    await expect(postgresStore.saveCaseProgress(id, stale, "synthetic-owner", original)).rejects.toThrow("CASE_CONFLICT");
    const saved = (await postgresStore.getCase(id, "synthetic-owner"))!.snapshot;
    expect(saved.clarificationNotes).toEqual(updated.clarificationNotes);
    expect(saved.reports).toEqual(original.reports);
    expect(saved.nodes).toEqual(original.nodes);
  } finally {
    await getDatabase().delete(citizenCasesTable).where(eq(citizenCasesTable.id, id));
  }
});
