import type { ArtifactId } from "./workflow";

export type ArtifactContent = {
  title: string;
  subtitle: string;
  /** Body lines of the generated demonstration draft. All values are synthetic. */
  body: string[];
};

/**
 * Generated demonstration drafts. These are populated only with synthetic
 * information and are never submitted anywhere.
 */
export const artifactContent: Record<ArtifactId, ArtifactContent> = {
  "correction-declaration": {
    title: "नाम सुधार घोषणा",
    subtitle: "Name correction declaration",
    body: [
      "विषय: एक ही व्यक्ति की दो वर्तनी के संबंध में घोषणा",
      "Form 4 में दर्ज नाम: Shyam Sunder",
      "बैंक अभिलेख में दर्ज नाम: Shyam Sundar",
      "घोषणा: उपरोक्त दोनों वर्तनी एक ही व्यक्ति की हैं।",
      "संलग्न: Form 4 की प्रति, पहचान पत्र की प्रति",
    ],
  },
  "bank-letter": {
    title: "बैंक को पत्र",
    subtitle: "Bank claim follow-up letter",
    body: [
      "सेवा में: शाखा प्रबंधक, भारतीय स्टेट बैंक (नमूना शाखा)",
      "विषय: लौटाए गए मृत्यु दावे पर पुनर्विचार",
      "कारण जो बताया गया: हस्ताक्षर मेल नहीं खाया",
      "निवेदन: संलग्न सुधार घोषणा के आधार पर दावा पुनः जाँचा जाए।",
      "संलग्न: नाम सुधार घोषणा, पूर्व पावती रसीद",
    ],
  },
  "rti-draft": {
    title: "RTI आवेदन मसौदा",
    subtitle: "RTI application draft",
    body: [
      "जन सूचना अधिकारी, संबंधित कार्यालय (नमूना)",
      "विषय: नॉमिनी दावे की स्थिति की सूचना",
      "मांगी गई सूचना: दावे पर अब तक की गई कार्रवाई और लंबित रहने का कारण।",
      "यह सामान्य विलंब का मामला है। 48-घंटे वाला जीवन-स्वतंत्रता प्रावधान यहाँ लागू नहीं है।",
      "स्थिति: क़तार में — भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
    ],
  },
  "npci-checklist": {
    title: "बैंक सीडिंग जाँच-सूची",
    subtitle: "Bank / NPCI seeding checklist",
    body: [
      "1. शाखा में आधार सीडिंग अनुरोध दीजिए।",
      "2. NPCI mapping सक्रिय है या नहीं, यह लिखित में पुछिए।",
      "3. सीडिंग पावती और उसका संदर्भ क्रमांक लीजिए।",
      "4. एक ही आधार कई खातों से जुड़ा हो तो सक्रिय खाता तय कराइए।",
      "5. पावती संदर्भ छात्रवृत्ति शिकायत में जोड़िए।",
    ],
  },
  "escalation-draft": {
    title: "NSP शिकायत मसौदा",
    subtitle: "Scholarship grievance draft",
    body: [
      "पोर्टल: राष्ट्रीय छात्रवृत्ति पोर्टल (नमूना)",
      "विषय: 'Released to PFMS' के बाद राशि जमा न होना",
      "पाया गया कारण: बैंक स्तर पर भुगतान लौटना (NPCI mapping न होना)",
      "की गई कार्रवाई: शाखा में सीडिंग अनुरोध, पावती संलग्न।",
      "स्थिति: क़तार में — भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
    ],
  },
};
