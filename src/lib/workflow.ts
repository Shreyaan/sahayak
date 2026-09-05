import { readIntent, type Intent } from "./intent";
import type { Localized } from "./locale";
import { z } from "zod";

/**
 * The reusable typed step library. A workflow node names one of these types and
 * supplies its own content, so both journeys are powered by the same engine.
 */
export type StepType =
  | "document-explain"
  | "identity-compare"
  | "document-correction"
  | "office-visit"
  | "online-action"
  | "desk-verification"
  | "bank-seeding-fix"
  | "grievance-file"
  | "rti-escalate"
  | "benefit-credit"
  | "case-complete";

export type NodeState = "pending" | "needs-you" | "verifying" | "blocked" | "done";

export type ArtifactId =
  | "correction-declaration"
  | "bank-letter"
  | "rti-draft"
  | "npci-checklist"
  | "escalation-draft";

export type VisitCard = {
  office: Localized;
  why: Localized;
  carry: Localized[];
  script: Localized;
  expect: Localized;
  collect: Localized;
};

/** A step the citizen completes on a website, with the exact URL to open. */
export type WebLink = {
  url: string;
  action: Localized;
  collect: Localized;
};

/** What one node does when an event resolves it. */
type Outcome = {
  /** State this node moves to. */
  state: NodeState;
  /** Node opened for the citizen next. */
  opens?: string;
  /** A blocked node this outcome clears, so recovery closes what it recovered from. */
  resolves?: string;
  reply: Localized;
  artifact?: ArtifactId;
  note?: Localized;
};

export type WorkflowNode = {
  id: string;
  type: StepType;
  title: Localized;
  detail: Localized;
  /** The clerk's question while this node is the current action. */
  ask: Localized;
  visit?: VisitCard;
  link?: WebLink;
  /** Suggested-response chip wording, so a tap answers the actual question. */
  confirmLabel?: Localized;
  declineLabel?: Localized;
  onConfirm: Outcome;
  onDecline?: Outcome;
  /** Desk verification: what the simulated desk returns after `slaDays`. */
  verify?: { slaDays: number; outcome: Outcome };
};

export type WorkflowDefinition = {
  id: string;
  title: Localized;
  subtitle: Localized;
  firstNodeId: string;
  nodes: WorkflowNode[];
  /** How this journey entered Sahayak: bundled seed, web form, or an AI clerk. */
  authoredBy?: "bundled" | "web-form" | "mcp";
  authoredAt?: string;
};

export type WorkflowId = "bereavement" | "scholarship";

const localizedWorkflowSchema = z.object({
  hi: z.string().trim().min(1).max(2_000),
  en: z.string().trim().min(1).max(2_000),
}).strict();

const outcomeSchema = z.object({
  state: z.enum(["pending", "needs-you", "verifying", "blocked", "done"]),
  opens: z.string().trim().min(1).max(128).optional(),
  resolves: z.string().trim().min(1).max(128).optional(),
  reply: localizedWorkflowSchema,
  artifact: z.enum(["correction-declaration", "bank-letter", "rti-draft", "npci-checklist", "escalation-draft"]).optional(),
  note: localizedWorkflowSchema.optional(),
}).strict();

const workflowNodeSchema = z.object({
  id: z.string().trim().min(1).max(128),
  type: z.enum(["document-explain", "identity-compare", "document-correction", "office-visit", "online-action", "desk-verification", "bank-seeding-fix", "grievance-file", "rti-escalate", "benefit-credit", "case-complete"]),
  title: localizedWorkflowSchema,
  detail: localizedWorkflowSchema,
  ask: localizedWorkflowSchema,
  visit: z.object({
    office: localizedWorkflowSchema, why: localizedWorkflowSchema, carry: z.array(localizedWorkflowSchema).max(20),
    script: localizedWorkflowSchema, expect: localizedWorkflowSchema, collect: localizedWorkflowSchema,
  }).strict().optional(),
  link: z.object({ url: z.string().url(), action: localizedWorkflowSchema, collect: localizedWorkflowSchema }).strict().optional(),
  confirmLabel: localizedWorkflowSchema.optional(),
  declineLabel: localizedWorkflowSchema.optional(),
  onConfirm: outcomeSchema,
  onDecline: outcomeSchema.optional(),
  verify: z.object({ slaDays: z.number().int().min(0).max(365), outcome: outcomeSchema }).strict().optional(),
}).strict();

/** Runtime validation for the one workflow model used by the engine and review revisions. */
export const workflowDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(128),
  title: localizedWorkflowSchema,
  subtitle: localizedWorkflowSchema,
  firstNodeId: z.string().trim().min(1).max(128),
  nodes: z.array(workflowNodeSchema).min(1).max(20),
  authoredBy: z.enum(["bundled", "web-form", "mcp"]).optional(),
  authoredAt: z.string().datetime().optional(),
}).strict().superRefine((definition, context) => {
  const ids = new Set<string>();
  for (const [index, node] of definition.nodes.entries()) {
    if (ids.has(node.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, "id"], message: "Node IDs must be unique." });
    ids.add(node.id);
  }
  if (!ids.has(definition.firstNodeId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["firstNodeId"], message: "The first node must exist." });
  for (const [index, node] of definition.nodes.entries()) {
    for (const [field, outcome] of [["onConfirm", node.onConfirm], ["onDecline", node.onDecline], ["verify", node.verify?.outcome]] as const) {
      for (const target of [outcome?.opens, outcome?.resolves]) {
        if (target && !ids.has(target)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes", index, field], message: "Outcome targets must exist." });
      }
    }
  }
});

export type CaseNode = {
  id: string;
  state: NodeState;
  /** Simulated day this node entered `verifying`, so each SLA clock is its own. */
  startedDay?: number;
};

export type CaseSnapshot = {
  workflowId: string;
  workflowVersionId: string;
  nodes: CaseNode[];
  artifacts: ArtifactId[];
  /** Simulated days elapsed. Demo time maps one simulated day to ten seconds. */
  day: number;
};

/** The closing node every journey ends on, including user-added ones. */
export const caseDoneNode: WorkflowNode = {
  id: "case-done",
  type: "case-complete",
  title: { hi: "केस सार तैयार", en: "Case summary ready" },
  detail: {
    hi: "आपका Case Card बन गया है। इसे प्रिंट या साझा कर सकते हैं।",
    en: "Your Case Card is ready. You can print it or share it.",
  },
  ask: {
    hi: "क्या मैं आपका Case Card तैयार कर दूँ?",
    en: "Shall I prepare your Case Card?",
  },
  onConfirm: {
    state: "done",
    reply: {
      hi: "Case Card तैयार है। ऊपर से खोलकर प्रिंट कर सकते हैं।",
      en: "Your Case Card is ready. Open it from the top to print it.",
    },
  },
};

/** The SLA breach note both journeys record after a three-day wait. */
const threeDayBreachNote: Localized = {
  hi: "समय-सीमा पार: 3 दिन",
  en: "Time limit crossed: 3 days",
};

const bereavement: WorkflowDefinition = {
  id: "bereavement",
  title: { hi: "मृत्यु के बाद के दावे", en: "Bereavement claim" },
  subtitle: { hi: "Bereavement claim", en: "Claims after a death in the family" },
  firstNodeId: "form4-explain",
  nodes: [
    {
      id: "form4-explain",
      type: "document-explain",
      title: { hi: "Form 4 समझें", en: "Understand Form 4" },
      detail: {
        hi: "Form 4 अस्पताल की मृत्यु सूचना है। बैंक और EPFO दोनों इसी से नाम मिलाते हैं।",
        en: "Form 4 is the hospital's notice of death. The bank and EPFO both match the name against it.",
      },
      ask: {
        hi: "मैंने आपका Form 4 पढ़ लिया है। क्या मैं आगे बढ़ूँ?",
        en: "I have read your Form 4. Shall I go ahead?",
      },
      onConfirm: {
        state: "done",
        opens: "name-check",
        reply: {
          hi: "ठीक है। अब नाम मिलान करते हैं।",
          en: "Alright. Now let us check the name.",
        },
      },
    },
    {
      id: "name-check",
      type: "identity-compare",
      title: { hi: "नाम की पुष्टि", en: "Check the name" },
      detail: {
        hi: "Form 4 में नाम Shyam Sunder है। बैंक रिकॉर्ड में Shyam Sundar दर्ज है।",
        en: "Form 4 has the name Shyam Sunder. The bank record has Shyam Sundar.",
      },
      ask: {
        hi: "Form 4 में नाम Shyam Sunder लिखा है। क्या यह सही है?",
        en: "Form 4 says the name is Shyam Sunder. Is that correct?",
      },
      confirmLabel: { hi: "हाँ, यही सही है", en: "Yes, that is correct" },
      declineLabel: { hi: "नहीं, बैंक में अलग है", en: "No, the bank has it differently" },
      onConfirm: {
        state: "done",
        opens: "bank-claim",
        reply: {
          hi: "ठीक है। अब बैंक क्लेम तैयार करते हैं।",
          en: "Alright. Now let us prepare the bank claim.",
        },
      },
      onDecline: {
        state: "blocked",
        opens: "name-correction",
        reply: {
          hi: "समझ गया। नाम मेल नहीं खाता, इसलिए पहले सुधार पत्र बनाना होगा।",
          en: "Understood. The names do not match, so a correction letter has to be made first.",
        },
        note: {
          hi: "Form 4: Shyam Sunder · बैंक: Shyam Sundar",
          en: "Form 4: Shyam Sunder · Bank: Shyam Sundar",
        },
      },
    },
    {
      id: "name-correction",
      type: "document-correction",
      title: { hi: "नाम सुधार घोषणा", en: "Name correction declaration" },
      detail: {
        hi: "एक सुधार घोषणा बनाइए जिसमें दोनों वर्तनी एक ही व्यक्ति की बताई गई हों।",
        en: "Prepare a correction declaration stating that both spellings belong to the same person.",
      },
      ask: {
        hi: "मैंने सुधार घोषणा का मसौदा तैयार कर दिया है। क्या इसे केस में जोड़ दूँ?",
        en: "I have drafted the correction declaration. Shall I add it to your case?",
      },
      onConfirm: {
        state: "done",
        opens: "bank-claim",
        resolves: "name-check",
        reply: {
          hi: "सुधार घोषणा केस में जुड़ गई। अब बैंक क्लेम तैयार करते हैं।",
          en: "The correction declaration is in your case. Now let us prepare the bank claim.",
        },
        artifact: "correction-declaration",
      },
    },
    {
      id: "bank-claim",
      type: "desk-verification",
      title: { hi: "बैंक क्लेम जमा करें", en: "Submit the bank claim" },
      detail: {
        hi: "बैंक शाखा में क्लेम फ़ॉर्म और सुधार घोषणा जमा कीजिए।",
        en: "Submit the claim form and the correction declaration at the bank branch.",
      },
      ask: {
        hi: "क्या आपने बैंक शाखा में क्लेम जमा कर दिया है?",
        en: "Have you submitted the claim at the bank branch?",
      },
      visit: {
        office: {
          hi: "भारतीय स्टेट बैंक — मुख्य शाखा",
          en: "State Bank of India — Main Branch",
        },
        why: {
          hi: "मृत्यु दावे पर मूल हस्ताक्षर शाखा में ही लिए जाते हैं।",
          en: "A death claim needs original signatures, and those are taken only at the branch.",
        },
        carry: [
          { hi: "Form 4 की प्रति", en: "A copy of Form 4" },
          { hi: "नाम सुधार घोषणा", en: "The name correction declaration" },
          { hi: "अपना पहचान पत्र", en: "Your own ID proof" },
          { hi: "पासबुक", en: "The passbook" },
        ],
        script: {
          hi: "मुझे खाताधारक की मृत्यु के बाद दावा जमा करना है। कृपया पावती दीजिए।",
          en: "I need to submit a claim after the account holder's death. Please give me an acknowledgement.",
        },
        expect: { hi: "लगभग 40 मिनट", en: "About 40 minutes" },
        collect: {
          hi: "पावती रसीद और उस पर दर्ज संदर्भ संख्या",
          en: "The acknowledgement slip and the reference number written on it",
        },
      },
      onConfirm: {
        state: "verifying",
        reply: {
          hi: "क्लेम जमा हो गया। बैंक की जाँच शुरू है — मैं नज़र रखता हूँ।",
          en: "The claim is submitted. The bank's check has started — I am keeping watch.",
        },
      },
      verify: {
        slaDays: 2,
        outcome: {
          state: "blocked",
          opens: "bank-claim-fix",
          reply: {
            hi: "बैंक ने दावा लौटा दिया है। कारण: हस्ताक्षर मेल नहीं खाया।",
            en: "The bank has returned the claim. Reason given: the signature did not match.",
          },
          note: {
            hi: "अस्वीकृति: हस्ताक्षर मेल नहीं खाया",
            en: "Rejection: the signature did not match",
          },
        },
      },
    },
    {
      id: "bank-claim-fix",
      type: "document-correction",
      title: { hi: "अस्वीकृति ठीक करें", en: "Fix the rejection" },
      detail: {
        hi: "बैंक को संबोधित एक पत्र बनाइए जिसमें हस्ताक्षर अंतर की पुष्टि हो।",
        en: "Prepare a letter to the bank confirming the difference in the signature.",
      },
      ask: {
        hi: "मैंने बैंक के लिए पत्र तैयार कर दिया है। क्या इसे जोड़कर आगे बढ़ें?",
        en: "I have prepared the letter for the bank. Shall I add it and move on?",
      },
      onConfirm: {
        state: "done",
        opens: "epfo-claim",
        resolves: "bank-claim",
        reply: {
          hi: "पत्र जुड़ गया। अब EPFO नॉमिनी दावा आगे बढ़ाते हैं।",
          en: "The letter is added. Now let us move the EPFO nominee claim forward.",
        },
        artifact: "bank-letter",
      },
    },
    {
      id: "epfo-claim",
      type: "desk-verification",
      title: { hi: "EPFO नॉमिनी दावा", en: "EPFO nominee claim" },
      detail: {
        hi: "EPFO कार्यालय में नॉमिनी दावा दर्ज कीजिए।",
        en: "File the nominee claim at the EPFO office.",
      },
      ask: {
        hi: "क्या EPFO नॉमिनी दावा दर्ज हो गया है?",
        en: "Has the EPFO nominee claim been filed?",
      },
      onConfirm: {
        state: "verifying",
        reply: {
          hi: "दावा दर्ज हो गया। तय समय-सीमा पर मैं नज़र रखता हूँ।",
          en: "The claim is filed. I am keeping watch on the stated time limit.",
        },
      },
      verify: {
        slaDays: 3,
        outcome: {
          state: "blocked",
          opens: "rti-draft",
          reply: {
            hi: "तय समय-सीमा निकल गई और कोई जवाब नहीं आया। अब escalation का हक़ बनता है।",
            en: "The time limit has passed and no reply came. You now have the right to escalate.",
          },
          note: threeDayBreachNote,
        },
      },
    },
    {
      id: "rti-draft",
      type: "rti-escalate",
      title: { hi: "RTI मसौदा तैयार करें", en: "Prepare the RTI draft" },
      detail: {
        hi: "देरी के लिए एक सामान्य RTI आवेदन। यह सामान्य विलंब है, इसलिए 48-घंटे वाला जीवन-स्वतंत्रता प्रावधान लागू नहीं है।",
        en: "An ordinary RTI application about the delay. This is ordinary delay, so the 48-hour life-and-liberty provision does not apply here.",
      },
      ask: {
        hi: "मैंने RTI का मसौदा तैयार किया है। क्या इसे केस में क़तार में रख दूँ?",
        en: "I have drafted the RTI. Shall I queue it in your case?",
      },
      onConfirm: {
        state: "done",
        opens: "case-done",
        resolves: "epfo-claim",
        reply: {
          hi: "RTI मसौदा क़तार में है। भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
          en: "The RTI draft is queued. Your approval will be taken before anything is sent.",
        },
        artifact: "rti-draft",
      },
    },
    caseDoneNode,
  ],
};

const scholarship: WorkflowDefinition = {
  id: "scholarship",
  title: { hi: "अटकी हुई छात्रवृत्ति", en: "Stuck scholarship" },
  subtitle: { hi: "Stuck NSP scholarship", en: "An NSP payment that never arrived" },
  firstNodeId: "nsp-status",
  nodes: [
    {
      id: "nsp-status",
      type: "document-explain",
      title: { hi: "NSP स्थिति समझें", en: "Understand the NSP status" },
      detail: {
        hi: "पोर्टल पर 'Released to PFMS' दिखता है, पर खाते में पैसा नहीं आया। इसका मतलब भुगतान बैंक स्तर पर अटका है।",
        en: "The portal shows 'Released to PFMS', but no money reached the account. That means the payment is stuck at the bank end.",
      },
      ask: {
        hi: "आपकी स्थिति 'Released to PFMS' दिख रही है पर पैसा नहीं आया। क्या मैं कारण ढूँढूँ?",
        en: "Your status shows 'Released to PFMS' but the money has not arrived. Shall I find the reason?",
      },
      onConfirm: {
        state: "done",
        opens: "pfms-trace",
        reply: {
          hi: "ठीक है। PFMS की तरफ़ से भुगतान की स्थिति देखते हैं।",
          en: "Alright. Let us look at the payment status from the PFMS side.",
        },
      },
    },
    {
      id: "pfms-trace",
      type: "desk-verification",
      title: { hi: "PFMS भुगतान जाँच", en: "PFMS payment check" },
      detail: {
        hi: "PFMS से भुगतान की वापसी का कारण मँगाया जाता है।",
        en: "The reason the payment came back is requested from PFMS.",
      },
      ask: {
        hi: "क्या मैं PFMS भुगतान जाँच शुरू कर दूँ?",
        en: "Shall I start the PFMS payment check?",
      },
      onConfirm: {
        state: "verifying",
        reply: {
          hi: "जाँच शुरू है। कारण मिलते ही बताता हूँ।",
          en: "The check has started. I will tell you as soon as the reason comes in.",
        },
      },
      verify: {
        slaDays: 1,
        outcome: {
          state: "blocked",
          opens: "bank-seeding",
          reply: {
            hi: "कारण मिल गया: बैंक ने भुगतान लौटा दिया — खाता आधार से नहीं जुड़ा (NPCI)।",
            en: "Found the reason: the bank returned the payment — the account is not linked to Aadhaar (NPCI).",
          },
          note: {
            hi: "छिपा कारण: NPCI mapping न होना",
            en: "Hidden reason: NPCI mapping missing",
          },
        },
      },
    },
    {
      id: "bank-seeding",
      type: "bank-seeding-fix",
      title: { hi: "बैंक खाता सीडिंग ठीक करें", en: "Fix the bank account seeding" },
      detail: {
        hi: "शाखा में जाकर खाता आधार से जुड़वाइए और NPCI mapping सक्रिय कराइए।",
        en: "Go to the branch, get the account linked to Aadhaar, and get NPCI mapping activated.",
      },
      ask: {
        hi: "क्या आपने शाखा में खाता सीडिंग का अनुरोध दे दिया है?",
        en: "Have you given the account seeding request at the branch?",
      },
      visit: {
        office: { hi: "आपकी बैंक शाखा", en: "Your bank branch" },
        why: {
          hi: "NPCI mapping शाखा से ही सक्रिय होती है, पोर्टल से नहीं।",
          en: "NPCI mapping is activated only at the branch, not on the portal.",
        },
        carry: [
          { hi: "पासबुक", en: "The passbook" },
          { hi: "आधार की प्रति", en: "A copy of your Aadhaar" },
          { hi: "छात्रवृत्ति आवेदन संख्या", en: "The scholarship application number" },
        ],
        script: {
          hi: "मेरा खाता आधार से जोड़कर NPCI mapping सक्रिय कीजिए। कृपया पावती दीजिए।",
          en: "Please link my account to Aadhaar and activate NPCI mapping. Please give me an acknowledgement.",
        },
        expect: { hi: "लगभग 30 मिनट", en: "About 30 minutes" },
        collect: {
          hi: "सीडिंग अनुरोध की पावती",
          en: "The acknowledgement for the seeding request",
        },
      },
      onConfirm: {
        state: "done",
        opens: "verify-again",
        resolves: "pfms-trace",
        reply: {
          hi: "सीडिंग अनुरोध दर्ज हो गया। अब दोबारा भुगतान जाँच लगाते हैं।",
          en: "The seeding request is recorded. Now let us run the payment check again.",
        },
        artifact: "npci-checklist",
      },
    },
    {
      id: "verify-again",
      type: "desk-verification",
      title: { hi: "दोबारा भुगतान जाँच", en: "Payment check again" },
      detail: {
        hi: "सीडिंग ठीक होने के बाद भुगतान दोबारा जाँचा जाता है।",
        en: "Once the seeding is fixed, the payment is checked again.",
      },
      ask: {
        hi: "क्या मैं दोबारा भुगतान जाँच लगा दूँ?",
        en: "Shall I run the payment check again?",
      },
      onConfirm: {
        state: "verifying",
        reply: {
          hi: "दोबारा जाँच लगी है। समय-सीमा पर नज़र है।",
          en: "The check is running again. I am watching the time limit.",
        },
      },
      verify: {
        slaDays: 3,
        outcome: {
          state: "blocked",
          opens: "grievance",
          reply: {
            hi: "तय समय-सीमा निकल गई। अब NSP शिकायत दर्ज करने का हक़ बनता है।",
            en: "The time limit has passed. You now have the right to file an NSP grievance.",
          },
          note: threeDayBreachNote,
        },
      },
    },
    {
      id: "grievance",
      type: "grievance-file",
      title: { hi: "NSP शिकायत दर्ज करें", en: "File the NSP grievance" },
      detail: {
        hi: "पोर्टल पर शिकायत का मसौदा, जिसमें सीडिंग पावती संदर्भ जुड़ा है।",
        en: "A grievance draft for the portal, with the seeding acknowledgement reference attached.",
      },
      ask: {
        hi: "मैंने शिकायत का मसौदा तैयार किया है। क्या इसे क़तार में रख दूँ?",
        en: "I have drafted the grievance. Shall I queue it?",
      },
      onConfirm: {
        state: "done",
        opens: "credit",
        resolves: "verify-again",
        reply: {
          hi: "शिकायत मसौदा क़तार में है। भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
          en: "The grievance draft is queued. Your approval will be taken before it is sent.",
        },
        artifact: "escalation-draft",
      },
    },
    {
      id: "credit",
      type: "benefit-credit",
      title: { hi: "राशि खाते में", en: "Money in the account" },
      detail: {
        hi: "सुधार के बाद छात्रवृत्ति राशि खाते में जमा हो जाती है।",
        en: "After the fix, the scholarship amount is credited to the account.",
      },
      ask: {
        hi: "क्या खाते में राशि जमा होने की पुष्टि दर्ज कर दूँ?",
        en: "Shall I record that the money has been credited?",
      },
      onConfirm: {
        state: "done",
        opens: "case-done",
        reply: {
          hi: "राशि जमा दर्ज हो गई।",
          en: "The credit is recorded.",
        },
      },
    },
    caseDoneNode,
  ],
};

export const workflows: Record<WorkflowId, WorkflowDefinition> = {
  bereavement,
  scholarship,
};

export const workflowIds = Object.keys(workflows) as WorkflowId[];

/**
 * Every journey this process can run: the bundled seeds plus any user-added
 * workflow registered at runtime. The engine reads only from this registry, so
 * a custom journey runs on exactly the same transitions as a bundled one.
 */
const registry = new Map<string, WorkflowDefinition>(Object.entries(workflows));

export function registerWorkflowDefinition(definition: WorkflowDefinition, workflowVersionId?: string): void {
  registry.set(workflowVersionId ?? definition.id, definition);
}

export function getWorkflowDefinition(id: string): WorkflowDefinition | undefined {
  return registry.get(id);
}

/** Resolves the immutable definition a saved case was started with. */
export function getCaseWorkflowDefinition(caseSnapshot: CaseSnapshot): WorkflowDefinition | undefined {
  return registry.get(caseSnapshot.workflowVersionId) ?? registry.get(caseSnapshot.workflowId);
}

export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === "string" && value in workflows;
}

export function findNode(workflowId: string, nodeId: string): WorkflowNode | undefined {
  return getWorkflowDefinition(workflowId)?.nodes.find((node) => node.id === nodeId);
}

/** Step types used by both journeys — the composition proof. */
export function sharedStepTypes(): StepType[] {
  const scholarshipTypes = new Set(scholarship.nodes.map((node) => node.type));
  return [...new Set(bereavement.nodes.map((node) => node.type))]
    .filter((type) => scholarshipTypes.has(type));
}

/** The blocking outcome a node can hit, if any. */
function blockingOutcome(node: WorkflowNode): Outcome | undefined {
  if (node.verify?.outcome.state === "blocked") return node.verify.outcome;
  if (node.onDecline?.state === "blocked") return node.onDecline;
  return undefined;
}

/**
 * The rejection or breach note a node carries, read from the bundled seed
 * rather than from the snapshot, so no note can be supplied by a client.
 * A node that was blocked and then recovered keeps its note as evidence.
 */
export function nodeNote(caseSnapshot: CaseSnapshot, nodeId: string): Localized | undefined {
  const entry = caseSnapshot.nodes.find((node) => node.id === nodeId);
  const definition = getCaseWorkflowDefinition(caseSnapshot)?.nodes.find((node) => node.id === nodeId);
  const blocking = definition && blockingOutcome(definition);

  if (!entry || !blocking) return undefined;
  if (entry.state === "blocked") return blocking.note;

  const recovery = caseSnapshot.nodes.find((node) => node.id === blocking.opens);
  return entry.state === "done" && recovery?.state === "done" ? blocking.note : undefined;
}

/** True once a node was blocked and its recovery step completed. */
export function isClearedBlocker(caseSnapshot: CaseSnapshot, nodeId: string): boolean {
  const entry = caseSnapshot.nodes.find((node) => node.id === nodeId);
  return entry?.state === "done" && nodeNote(caseSnapshot, nodeId) !== undefined;
}

export function startCase(
  workflowId: string,
  workflowVersionId = `${workflowId}-v1`,
): CaseSnapshot {
  const workflow = registry.get(workflowVersionId) ?? getWorkflowDefinition(workflowId);
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);

  return {
    workflowId,
    workflowVersionId,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      state: node.id === workflow.firstNodeId ? "needs-you" : "pending",
    })),
    artifacts: [],
    day: 0,
  };
}

/** The node the citizen is being asked about right now. */
export function currentNode(caseSnapshot: CaseSnapshot): WorkflowNode | undefined {
  const open = caseSnapshot.nodes.find((node) => node.state === "needs-you");
  return open && getCaseWorkflowDefinition(caseSnapshot)?.nodes.find((node) => node.id === open.id);
}

function applyOutcome(
  caseSnapshot: CaseSnapshot,
  nodeId: string,
  outcome: Outcome,
): CaseSnapshot {
  return {
    ...caseSnapshot,
    nodes: caseSnapshot.nodes.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          state: outcome.state,
          startedDay: outcome.state === "verifying" ? caseSnapshot.day : undefined,
        };
      }
      if (node.id === outcome.resolves) return { ...node, state: "done" };
      if (node.id === outcome.opens) return { ...node, state: "needs-you" };
      return node;
    }),
    artifacts: outcome.artifact && !caseSnapshot.artifacts.includes(outcome.artifact)
      ? [...caseSnapshot.artifacts, outcome.artifact]
      : caseSnapshot.artifacts,
  };
}

/** Replies the engine itself produces, outside any node's content. */
const engineReplies = {
  waiting: {
    hi: "अभी जाँच चल रही है। जवाब आते ही मैं बताऊँगा।",
    en: "A check is still running. I will tell you as soon as there is a reply.",
  },
  allDone: {
    hi: "इस केस के सारे कदम पूरे हो चुके हैं। आपका Case Card तैयार है।",
    en: "Every step in this case is done. Your Case Card is ready.",
  },
  noReplyYet: {
    hi: "अभी तक कोई जवाब नहीं आया। मैं नज़र रखे हुए हूँ।",
    en: "No reply has come yet. I am keeping watch.",
  },
  nothingPending: {
    hi: "अभी कोई जाँच लंबित नहीं है, इसलिए समय नहीं बदला।",
    en: "No check is pending, so demo time did not change.",
  },
} satisfies Record<string, Localized>;

export type EngineResult = { caseSnapshot: CaseSnapshot; reply: Localized };

/**
 * Resolves a citizen reply against the current node. This is the only authority
 * for case transitions; the language model never decides one.
 */
export function applyCitizenReply(caseSnapshot: CaseSnapshot, message: string): EngineResult {
  return applyIntent(caseSnapshot, readIntent(message));
}

/**
 * Applies an already-read confirmation signal. The signal may come from the
 * deterministic reader or from the clerk model, but only this function decides
 * what the case does with it.
 */
export function applyIntent(caseSnapshot: CaseSnapshot, intent: Intent): EngineResult {
  const node = currentNode(caseSnapshot);

  if (!node) {
    const waiting = caseSnapshot.nodes.some((entry) => entry.state === "verifying");
    return {
      caseSnapshot,
      reply: waiting ? engineReplies.waiting : engineReplies.allDone,
    };
  }

  if (intent === "affirmative") {
    return {
      caseSnapshot: applyOutcome(caseSnapshot, node.id, node.onConfirm),
      reply: node.onConfirm.reply,
    };
  }

  if (intent === "negative" && node.onDecline) {
    return {
      caseSnapshot: applyOutcome(caseSnapshot, node.id, node.onDecline),
      reply: node.onDecline.reply,
    };
  }

  return { caseSnapshot, reply: node.ask };
}

/**
 * Advances simulated time only while a desk verification is pending, then
 * releases it when its clock expires. Demo mode is deterministic.
 */
export function advanceDay(caseSnapshot: CaseSnapshot): EngineResult {
  const verifying = caseSnapshot.nodes.find((node) => node.state === "verifying");

  if (!verifying) {
    return { caseSnapshot, reply: engineReplies.nothingPending };
  }

  const day = caseSnapshot.day + 1;
  const definition = getCaseWorkflowDefinition(caseSnapshot)?.nodes.find((node) => node.id === verifying.id);

  const elapsed = day - (verifying.startedDay ?? 0);

  if (!definition?.verify || elapsed < definition.verify.slaDays) {
    return {
      caseSnapshot: { ...caseSnapshot, day },
      reply: engineReplies.noReplyYet,
    };
  }

  return {
    caseSnapshot: { ...applyOutcome(caseSnapshot, verifying.id, definition.verify.outcome), day },
    reply: definition.verify.outcome.reply,
  };
}
