import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { citizenCasesTable } from "@/db/schema";
import { postgresStore } from "./store";
import { applyCitizenReply, recordDeskReport, startCase } from "./workflow";

test("PostgreSQL never acknowledges an overwritten concurrent report", async () => {
  const id = `synthetic-concurrency-${crypto.randomUUID()}`;
  const original = applyCitizenReply(startCase("scholarship"), "yes").caseSnapshot;
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
