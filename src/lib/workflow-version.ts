import { and, asc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { workflowVersionsTable } from "@/db/schema";
import { parseTrustMetadata } from "./trust";

function validateTrust<T extends { trust: unknown }>(version: T | undefined): T | undefined {
  return version && { ...version, trust: parseTrustMetadata(version.trust) };
}

export async function getPublishedWorkflowVersion(id: string) {
  const [version] = await getDatabase()
    .select()
    .from(workflowVersionsTable)
    .where(and(eq(workflowVersionsTable.id, id), eq(workflowVersionsTable.status, "published")))
    .limit(1);

  return validateTrust(version);
}

/** Exact historical version lookup for an already-started case. */
export async function getWorkflowVersion(id: string) {
  const [version] = await getDatabase()
    .select()
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.id, id))
    .limit(1);

  return validateTrust(version);
}

/** Published catalogue used by the citizen library; drafts never cross this boundary. */
export async function listPublishedWorkflowVersions() {
  const versions = await getDatabase()
    .select()
    .from(workflowVersionsTable)
    .where(eq(workflowVersionsTable.status, "published"))
    .orderBy(asc(workflowVersionsTable.workflowId), asc(workflowVersionsTable.version));

  const latest = new Map<string, (typeof versions)[number]>();
  for (const version of versions) {
    const current = latest.get(version.workflowId);
    if (!current || version.version > current.version) latest.set(version.workflowId, version);
  }
  return [...latest.values()].map((version) => validateTrust(version)!);
}
