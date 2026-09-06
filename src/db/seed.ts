import { getDatabase } from "./client";
import { searchDocumentsTable, workflowVersionsTable, workflowsTable } from "./schema";
import { workflows } from "@/lib/workflow";
import { trustMetadataSchema } from "@/lib/trust";

const seeds = [
  {
    workflowId: "bereavement" as const,
    workflowVersionId: "bereavement-v2",
    version: 2,
    trust: {
      provenance: "legacy-verification-pending",
      reviewDate: null,
      verificationMethod: "Synthetic secondary stress-test workflow. Expert verification and real-world outcome evidence are still pending.",
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
    workflowVersionId: "scholarship-v5",
    version: 5,
    trust: {
      provenance: "legacy-verification-pending",
      reviewDate: null,
      verificationMethod: "Synthetic MVP workflow. Expert verification and real-world outcome evidence are still pending.",
      currentExpertSupportCount: 0,
      hasUnresolvedDisagreement: false,
      sourceLinks: [
        { label: "National Scholarships Portal", url: "https://scholarships.gov.in/Students" },
        { label: "National Scholarships Portal: About Us", url: "https://scholarships.gov.in/aboutUs" },
        { label: "Department of Higher Education: NSP payment tracking", url: "https://highereducation.nagaland.gov.in/nsp-payment-status/" },
        { label: "NSP: whom to address payment grievances", url: "https://nsp.gov.in/NSPADMIN/RTIContact" },
      ],
    },
    documents: {
      en: "Stuck scholarship. Scholarship released to PFMS but payment not received. NSP scholarship scholorship payment bank account NPCI Aadhaar seeding paisa nahi aaya student grant.",
      hi: "अटकी छात्रवृत्ति। NSP या PFMS में छात्रवृत्ति जारी दिखती है लेकिन बैंक खाते में पैसा नहीं आया। स्कॉलरशिप भुगतान NPCI आधार सीडिंग।",
    },
  },
  {
    workflowId: "aadhaar-update" as const, workflowVersionId: "aadhaar-update-v1", version: 1,
    trust: {
      provenance: "legacy-verification-pending", reviewDate: null,
      verificationMethod: "Synthetic demonstration. Official guidance consulted on 6 September 2026; independent expert review and real citizen outcomes are pending. Sahayak does not access UIDAI systems.",
      currentExpertSupportCount: 0, hasUnresolvedDisagreement: false,
      sourceLinks: [
        { label: "UIDAI: online services and update status", url: "https://www.uidai.gov.in/en/921-faqs/aadhaar-online" },
        { label: "UIDAI: update processing and follow-up", url: "https://uidai.gov.in/en/circulars-memorandums-notification/282-english-uk/faqs/your-aadhaar/aadhaar-letter/1880-i-updated-my-aadhaar-recently-but-it-shows-under-manual-check-when-will-it-get-updated.html" },
        { label: "PIB / UIDAI: rejection reasons and 1947 assistance", url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1925404" },
      ],
    },
    documents: {
      en: "Aadhaar aadhar adhar update pending rejected correction name address myAadhaar UIDAI URN SRN acknowledgement update status reject ho gaya aadhar update atka hai.",
      hi: "आधार अपडेट लंबित अस्वीकृत नाम पता सुधार पावती अनुरोध की स्थिति UIDAI myAadhaar 1947 आधार अपडेट अटका है रिजेक्ट हुआ।",
    },
  },
  {
    workflowId: "epfo-claim" as const, workflowVersionId: "epfo-claim-v1", version: 1,
    trust: {
      provenance: "legacy-verification-pending", reviewDate: null,
      verificationMethod: "Synthetic own-PF-claim demonstration. Official EPFO/EPFiGMS guidance consulted on 6 September 2026; expert review and real citizen outcomes are pending. No eligibility or payment guarantees.",
      currentExpertSupportCount: 0, hasUnresolvedDisagreement: false,
      sourceLinks: [
        { label: "EPFO: employee services and claim status", url: "https://www.epfindia.gov.in/site_en/For_Employees.php" },
        { label: "EPFiGMS: registration, status and reminders", url: "https://epfigms.gov.in/" },
      ],
    },
    documents: {
      en: "EPFO PF own withdrawal claim pending rejected returned settled but not credited payment status EPFiGMS grievance reminder provident fund pf paisa nahi aaya claim atka.",
      hi: "EPFO पीएफ PF भविष्य निधि अपना निकासी दावा लंबित अस्वीकृत वापस भुगतान पैसा नहीं आया दावा अटका EPFiGMS शिकायत संदर्भ रिमाइंडर।",
    },
  },
  {
    workflowId: "punjab-income" as const, workflowVersionId: "punjab-income-v1", version: 1, stateCode: "PB",
    trust: {
      provenance: "legacy-verification-pending", reviewDate: null,
      verificationMethod: "Synthetic Punjab demonstration. Official service guidance consulted on 7 September 2026. Independent expert review and real citizen outcomes are pending. No government contact or application submission by Sahayak.",
      currentExpertSupportCount: 0, hasUnresolvedDisagreement: false,
      sourceLinks: [
        { label: "Punjab: Sewa Kendra support and 1100", url: "https://dit.punjab.gov.in/projects/sewa-kendras/" },
        { label: "Punjab: Income Certificate service guidance", url: "https://punjab.gov.in/wp-content/uploads/2025/09/Income-Certificate.pdf" },
        { label: "Jalandhar district: official tracking and certificate service links", url: "https://jalandhar.nic.in/sewa-kendra/" },
      ],
    },
    documents: {
      en: "Punjab income certificate application pending rejected delayed stuck sewa kendra connect punjab aamdani aay certificate nahi mila income certificate atka hai support 1100.",
      hi: "पंजाब आय प्रमाणपत्र आवेदन लंबित अटका अस्वीकृत सेवा केंद्र आय सर्टिफिकेट नहीं मिला आय प्रमाण पत्र देरी सहायता 1100।",
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
      version: seed.version,
      status: "published",
      scope: "stateCode" in seed ? "state" : "central",
      stateCode: "stateCode" in seed ? seed.stateCode : null,
      definition,
      trust: trustMetadataSchema.parse(seed.trust),
      publishedAt: new Date("2026-09-06T00:00:00.000Z"),
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
  console.info(`Seeded ${seeds.length} synthetic published workflow versions.`);
  process.exit(0);
}
