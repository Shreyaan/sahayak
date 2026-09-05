import { getDatabase } from "./client";
import { searchDocumentsTable, workflowVersionsTable, workflowsTable } from "./schema";
import { workflows } from "@/lib/workflow";
import { trustMetadataSchema } from "@/lib/trust";

const seeds = [
  {
    workflowId: "bereavement" as const,
    workflowVersionId: "bereavement-v1",
    trust: {
      provenance: "official-source-reviewed",
      reviewDate: "2026-09-04",
      verificationMethod: "Seeded prototype guidance checked against public official sources.",
      currentExpertSupportCount: 0,
      hasUnresolvedDisagreement: false,
      sourceLinks: [],
    },
    documents: {
      en: "Bereavement claim. Claims after a death in the family. death deceased nominee bank claim Form 4 EPFO pension family papa father death ke baad bank claim mrityu dawa.",
      hi: "मृत्यु के बाद के दावे। परिवार में मृत्यु के बाद बैंक, नॉमिनी, Form 4 और EPFO का दावा। पिता पापा मृत्यु बैंक दावा डेथ क्लेम।",
    },
  },
  {
    workflowId: "scholarship" as const,
    workflowVersionId: "scholarship-v1",
    trust: {
      provenance: "official-source-reviewed",
      reviewDate: "2026-09-04",
      verificationMethod: "Seeded prototype guidance checked against public official sources.",
      currentExpertSupportCount: 0,
      hasUnresolvedDisagreement: false,
      sourceLinks: [
        { label: "National Scholarships Portal", url: "https://scholarships.gov.in/Students" },
        { label: "National Scholarships Portal: About Us", url: "https://scholarships.gov.in/aboutUs" },
      ],
    },
    documents: {
      en: "Stuck scholarship. Scholarship released to PFMS but payment not received. NSP scholarship scholorship payment bank account NPCI Aadhaar seeding paisa nahi aaya student grant.",
      hi: "अटकी छात्रवृत्ति। NSP या PFMS में छात्रवृत्ति जारी दिखती है लेकिन बैंक खाते में पैसा नहीं आया। स्कॉलरशिप भुगतान NPCI आधार सीडिंग।",
    },
  },
];

export async function seedPublishedWorkflows(): Promise<void> {
  const db = getDatabase();

  for (const seed of seeds) {
    const definition = workflows[seed.workflowId];
    await db.insert(workflowsTable).values({ id: seed.workflowId }).onConflictDoNothing();
    await db.insert(workflowVersionsTable).values({
      id: seed.workflowVersionId,
      workflowId: seed.workflowId,
      version: 1,
      status: "published",
      scope: "central",
      definition,
      trust: trustMetadataSchema.parse(seed.trust),
      publishedAt: new Date("2026-09-04T00:00:00.000Z"),
    }).onConflictDoNothing();

    for (const locale of ["hi", "en"] as const) {
      await db.insert(searchDocumentsTable).values({
        id: `${seed.workflowVersionId}-${locale}`,
        workflowVersionId: seed.workflowVersionId,
        locale,
        title: definition.title[locale],
        summary: definition.subtitle[locale],
        searchText: seed.documents[locale],
      }).onConflictDoNothing();
    }
  }
}

if (import.meta.main) {
  await seedPublishedWorkflows();
  console.info("Seeded two published workflow versions.");
  process.exit(0);
}
