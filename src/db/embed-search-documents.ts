import { asc, eq } from "drizzle-orm";
import { getDatabase } from "./client";
import { searchDocumentsTable, workflowVersionsTable } from "./schema";
import { embedSearchDocuments } from "@/lib/search/embeddings";

export async function embedPublishedSearchDocuments(): Promise<number> {
  const db = getDatabase();
  const documents = await db
    .select({ id: searchDocumentsTable.id, searchText: searchDocumentsTable.searchText })
    .from(searchDocumentsTable)
    .innerJoin(workflowVersionsTable, eq(searchDocumentsTable.workflowVersionId, workflowVersionsTable.id))
    .where(eq(workflowVersionsTable.status, "published"))
    .orderBy(asc(searchDocumentsTable.id));

  if (documents.length === 0) return 0;

  const embeddings = await embedSearchDocuments(documents.map((document) => document.searchText));
  await db.transaction(async (transaction) => {
    for (const [index, document] of documents.entries()) {
      await transaction
        .update(searchDocumentsTable)
        .set({ embedding: embeddings[index] })
        .where(eq(searchDocumentsTable.id, document.id));
    }
  });

  return documents.length;
}

if (import.meta.main) {
  const count = await embedPublishedSearchDocuments();
  console.info(`Embedded ${count} published search documents.`);
  process.exit(0);
}
