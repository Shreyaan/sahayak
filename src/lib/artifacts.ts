import type { Localized } from "./locale";
import type { ArtifactId } from "./workflow";

export type ArtifactContent = {
  title: Localized;
  subtitle: Localized;
  /** Body lines of the generated demonstration draft. All values are synthetic. */
  body: Localized[];
};

/**
 * Generated demonstration drafts. These are populated only with synthetic
 * information and are never submitted anywhere.
 */
export const artifactContent: Record<ArtifactId, ArtifactContent> = {
  "correction-declaration": {
    title: { hi: "नाम सुधार घोषणा", en: "Name correction declaration" },
    subtitle: {
      hi: "Name correction declaration",
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
      hi: "Bank claim follow-up letter",
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
        hi: "निवेदन: संलग्न सुधार घोषणा के आधार पर दावा पुनः जाँचा जाए।",
        en: "Request: please review the claim again on the basis of the enclosed correction declaration.",
      },
      {
        hi: "संलग्न: नाम सुधार घोषणा, पूर्व पावती रसीद",
        en: "Enclosed: the name correction declaration, the earlier acknowledgement slip",
      },
    ],
  },
  "rti-draft": {
    title: { hi: "RTI आवेदन मसौदा", en: "RTI application draft" },
    subtitle: {
      hi: "RTI application draft",
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
        hi: "स्थिति: क़तार में — भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
        en: "Status: queued — your approval will be taken before it is sent.",
      },
    ],
  },
  "npci-checklist": {
    title: { hi: "बैंक सीडिंग जाँच-सूची", en: "Bank seeding checklist" },
    subtitle: {
      hi: "Bank / NPCI seeding checklist",
      en: "What to ask for at the branch",
    },
    body: [
      {
        hi: "1. शाखा में आधार सीडिंग अनुरोध दीजिए।",
        en: "1. Give the Aadhaar seeding request at the branch.",
      },
      {
        hi: "2. NPCI mapping सक्रिय है या नहीं, यह लिखित में पुछिए।",
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
      hi: "Scholarship grievance draft",
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
        hi: "पाया गया कारण: बैंक स्तर पर भुगतान लौटना (NPCI mapping न होना)",
        en: "Reason found: the payment bounced at the bank end (NPCI mapping missing)",
      },
      {
        hi: "की गई कार्रवाई: शाखा में सीडिंग अनुरोध, पावती संलग्न।",
        en: "Action taken: a seeding request at the branch, acknowledgement enclosed.",
      },
      {
        hi: "स्थिति: क़तार में — भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
        en: "Status: queued — your approval will be taken before it is sent.",
      },
    ],
  },
};
