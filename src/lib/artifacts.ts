import { t, type Locale, type Localized } from "./locale";
import type { ArtifactId, CaseSnapshot } from "./workflow";

export type ArtifactContent = {
  title: Localized;
  subtitle: Localized;
  /** Body lines of the generated example draft. Seed values are synthetic. */
  body: Localized[];
};

/**
 * Generated example drafts. Bundled values are synthetic
 * information and are never submitted anywhere.
 */
export const artifactContent: Record<ArtifactId, ArtifactContent> = {
  "correction-declaration": {
    title: { hi: "नाम सुधार घोषणा", en: "Name correction declaration" },
    subtitle: {
      hi: "दो वर्तनी एक ही व्यक्ति की होने की घोषणा",
      en: "States that two spellings are one person",
    },
    body: [
      {
        hi: "विषय: एक ही व्यक्ति की दो वर्तनी के संबंध में घोषणा",
        en: "Subject: Declaration about two spellings of one person's name",
      },
      {
        hi: "Form 4 में दर्ज नाम: Shyam Sunder",
        en: "Name recorded in Form 4: Shyam Sunder",
      },
      {
        hi: "बैंक अभिलेख में दर्ज नाम: Shyam Sundar",
        en: "Name recorded in the bank record: Shyam Sundar",
      },
      {
        hi: "घोषणा: उपरोक्त दोनों वर्तनी एक ही व्यक्ति की हैं।",
        en: "Declaration: both spellings above belong to the same person.",
      },
      {
        hi: "संलग्न: Form 4 की प्रति, पहचान पत्र की प्रति",
        en: "Enclosed: a copy of Form 4, a copy of the ID proof",
      },
    ],
  },
  "bank-letter": {
    title: { hi: "बैंक को पत्र", en: "Letter to the bank" },
    subtitle: {
      hi: "लौटाए गए बैंक दावे पर अनुवर्ती पत्र",
      en: "Follow-up on a returned bank claim",
    },
    body: [
      {
        hi: "सेवा में: शाखा प्रबंधक, भारतीय स्टेट बैंक (नमूना शाखा)",
        en: "To: The Branch Manager, State Bank of India (sample branch)",
      },
      {
        hi: "विषय: लौटाए गए मृत्यु दावे पर पुनर्विचार",
        en: "Subject: Reconsideration of a returned death claim",
      },
      {
        hi: "कारण जो बताया गया: हस्ताक्षर मेल नहीं खाया",
        en: "Reason given: the signature did not match",
      },
      {
        hi: "निवेदन: लौटाए गए दावे की दोबारा जाँच करके निर्णय लिखित में दिया जाए।",
        en: "Request: please review the returned claim again and provide the decision in writing.",
      },
      {
        hi: "जमा करने से पहले: केवल उन्हीं दस्तावेज़ों की सूची लिखें जिन्हें आप वास्तव में संलग्न कर रहे हैं।",
        en: "Before submitting: list only the documents you are actually attaching.",
      },
    ],
  },
  "rti-draft": {
    title: { hi: "RTI आवेदन मसौदा", en: "RTI application draft" },
    subtitle: {
      hi: "दावे पर हुई कार्रवाई की जानकारी माँगता है",
      en: "Asks what has been done on the claim",
    },
    body: [
      {
        hi: "जन सूचना अधिकारी, संबंधित कार्यालय (नमूना)",
        en: "Public Information Officer, the concerned office (sample)",
      },
      {
        hi: "विषय: नॉमिनी दावे की स्थिति की सूचना",
        en: "Subject: Information on the status of a nominee claim",
      },
      {
        hi: "मांगी गई सूचना: दावे पर अब तक की गई कार्रवाई और लंबित रहने का कारण।",
        en: "Information sought: the action taken on the claim so far, and the reason it is still pending.",
      },
      {
        hi: "यह सामान्य विलंब का मामला है। 48-घंटे वाला जीवन-स्वतंत्रता प्रावधान यहाँ लागू नहीं है।",
        en: "This is a case of ordinary delay. The 48-hour life-and-liberty provision does not apply here.",
      },
      {
        hi: "स्थिति: केवल मसौदा — सहायक ने इसे जमा नहीं किया है।",
        en: "Status: draft only — Sahayak has not submitted it.",
      },
    ],
  },
  "npci-checklist": {
    title: { hi: "बैंक सीडिंग जाँच-सूची", en: "Bank seeding checklist" },
    subtitle: {
      hi: "शाखा में क्या पूछना है",
      en: "What to ask for at the branch",
    },
    body: [
      {
        hi: "1. शाखा में आधार सीडिंग अनुरोध दीजिए।",
        en: "1. Give the Aadhaar seeding request at the branch.",
      },
      {
        hi: "2. NPCI mapping सक्रिय है या नहीं, यह लिखित में पूछिए।",
        en: "2. Ask in writing whether NPCI mapping is active or not.",
      },
      {
        hi: "3. सीडिंग पावती और उसका संदर्भ क्रमांक लीजिए।",
        en: "3. Take the seeding acknowledgement and its reference number.",
      },
      {
        hi: "4. एक ही आधार कई खातों से जुड़ा हो तो सक्रिय खाता तय कराइए।",
        en: "4. If one Aadhaar is linked to several accounts, get the active account settled.",
      },
      {
        hi: "5. पावती संदर्भ छात्रवृत्ति शिकायत में जोड़िए।",
        en: "5. Add the acknowledgement reference to the scholarship grievance.",
      },
    ],
  },
  "escalation-draft": {
    title: { hi: "NSP शिकायत मसौदा", en: "NSP grievance draft" },
    subtitle: {
      hi: "जारी हुई लेकिन खाते में न पहुँची छात्रवृत्ति के लिए",
      en: "For a scholarship released but never credited",
    },
    body: [
      {
        hi: "पोर्टल: राष्ट्रीय छात्रवृत्ति पोर्टल (नमूना)",
        en: "Portal: National Scholarship Portal (sample)",
      },
      {
        hi: "विषय: 'Released to PFMS' के बाद राशि जमा न होना",
        en: "Subject: Amount not credited after 'Released to PFMS'",
      },
      {
        hi: "केस रिकॉर्ड में नागरिक द्वारा दर्ज जवाब यहाँ जोड़ा जाएगा।",
        en: "The citizen-reported response from the case record will be inserted here.",
      },
      {
        hi: "केवल नागरिक द्वारा दर्ज संदर्भ और प्रमाण का उल्लेख किया जाएगा।",
        en: "Only references and evidence recorded by the citizen will be mentioned.",
      },
      {
        hi: "स्थिति: केवल मसौदा — सहायक ने इसे जमा नहीं किया है।",
        en: "Status: draft only — Sahayak has not submitted it.",
      },
    ],
  },
};

function displayDate(value: string, locale: Locale): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  if (locale === "hi") {
    return new Intl.DateTimeFormat("hi-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
}

/** Renders an artifact from the immutable template plus facts the citizen actually recorded. */
export function renderArtifactBody(id: ArtifactId, snapshot: CaseSnapshot, locale: Locale): string[] {
  if (id !== "escalation-draft") return artifactContent[id].body.map((line) => t(line, locale));

  const reports = snapshot.reports ?? [];
  const report = [...reports].reverse().find(({ stepId }) => stepId === "verify-again")
    ?? [...reports].reverse().find(({ stepId }) => stepId === "pfms-trace");
  const acknowledgement = [...reports].reverse().find(({ stepId }) => stepId === "bank-seeding");
  const fallback = artifactContent[id].body.map((line) => t(line, locale));
  if (!report) return fallback;

  return locale === "hi" ? [
    "पोर्टल: राष्ट्रीय छात्रवृत्ति पोर्टल (नमूना)",
    "विषय: 'Released to PFMS' के बाद राशि जमा न होना",
    `नागरिक द्वारा ${displayDate(report.responseDate, locale)} को दर्ज जवाब: ${report.response}`,
    `संदर्भ संख्या: ${acknowledgement?.referenceNumber || report.referenceNumber || "दर्ज नहीं की गई"}`,
    `प्रमाण का नोट: ${acknowledgement?.evidence || report.evidence || "दर्ज नहीं किया गया"}`,
    "निवेदन: कृपया भुगतान की स्थिति जाँचकर लिखित जवाब और संदर्भ संख्या दें।",
    "स्थिति: केवल मसौदा — सहायक ने इसे जमा नहीं किया है।",
  ] : [
    "Portal: National Scholarship Portal (sample)",
    "Subject: Amount not credited after 'Released to PFMS'",
    `Citizen-reported response on ${displayDate(report.responseDate, locale)}: ${report.response}`,
    `Reference number: ${acknowledgement?.referenceNumber || report.referenceNumber || "Not recorded"}`,
    `Evidence note: ${acknowledgement?.evidence || report.evidence || "Not recorded"}`,
    "Request: please check the payment status and provide a written response and reference number.",
    "Status: draft only — Sahayak has not submitted it.",
  ];
}
