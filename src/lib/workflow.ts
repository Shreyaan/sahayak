import { caseAction, unmatchedResponse, unmatchedGuidance } from "./response-guidance";
export type Intent = "affirmative" | "negative" | "unknown";
import type { Localized } from "./locale";
import type { ArtifactDraft } from "./artifact-drafts";
import { z } from "zod";
import { punjabIncome } from "./workflows/punjab-income";
import { aadhaarUpdate, epfoClaim } from "./workflows/additional";

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

export type NodeState =
  "pending" | "needs-you" | "verifying" | "blocked" | "done";

export const artifactIds = [
  "correction-declaration",
  "bank-letter",
  "rti-draft",
  "npci-checklist",
  "escalation-draft",
] as const;

export const artifactIdSchema = z.enum(artifactIds);
export type ArtifactId = z.infer<typeof artifactIdSchema>;

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

export type DeskReportOption = {
  id: string;
  label: Localized;
  reply: Localized;
  outcome?: Outcome;
};

export type DeskReport = {
  stepId: string;
  optionId: string;
  response: string;
  responseDate: string;
  referenceNumber?: string;
  evidence?: string;
  recordedAt: string;
  synthetic: boolean;
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
  /** Citizen-reported portal or desk result. Only an explicit option may move the journey. */
  report?: {
    prompt: Localized;
    options: DeskReportOption[];
  };
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

export type WorkflowId =
  | "bereavement"
  | "scholarship"
  | "aadhaar-update"
  | "epfo-claim"
  | "punjab-income";

const localizedWorkflowSchema = z
  .object({
    hi: z.string().trim().min(1).max(2_000),
    en: z.string().trim().min(1).max(2_000),
  })
  .strict();

const outcomeSchema = z
  .object({
    state: z.enum(["pending", "needs-you", "verifying", "blocked", "done"]),
    opens: z.string().trim().min(1).max(128).optional(),
    resolves: z.string().trim().min(1).max(128).optional(),
    reply: localizedWorkflowSchema,
    artifact: artifactIdSchema.optional(),
    note: localizedWorkflowSchema.optional(),
  })
  .strict();

const workflowNodeSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    type: z.enum([
      "document-explain",
      "identity-compare",
      "document-correction",
      "office-visit",
      "online-action",
      "desk-verification",
      "bank-seeding-fix",
      "grievance-file",
      "rti-escalate",
      "benefit-credit",
      "case-complete",
    ]),
    title: localizedWorkflowSchema,
    detail: localizedWorkflowSchema,
    ask: localizedWorkflowSchema,
    visit: z
      .object({
        office: localizedWorkflowSchema,
        why: localizedWorkflowSchema,
        carry: z.array(localizedWorkflowSchema).max(20),
        script: localizedWorkflowSchema,
        expect: localizedWorkflowSchema,
        collect: localizedWorkflowSchema,
      })
      .strict()
      .optional(),
    link: z
      .object({
        url: z.string().url(),
        action: localizedWorkflowSchema,
        collect: localizedWorkflowSchema,
      })
      .strict()
      .optional(),
    confirmLabel: localizedWorkflowSchema.optional(),
    declineLabel: localizedWorkflowSchema.optional(),
    onConfirm: outcomeSchema,
    onDecline: outcomeSchema.optional(),
    report: z
      .object({
        prompt: localizedWorkflowSchema,
        options: z
          .array(
            z
              .object({
                id: z.string().trim().min(1).max(64),
                label: localizedWorkflowSchema,
                reply: localizedWorkflowSchema,
                outcome: outcomeSchema.optional(),
              })
              .strict()
          )
          .min(1)
          .max(8),
      })
      .strict()
      .optional(),
    verify: z
      .object({
        slaDays: z.number().int().min(0).max(365),
        outcome: outcomeSchema,
      })
      .strict()
      .optional(),
  })
  .strict();

/** Runtime validation for the one workflow model used by the engine and review revisions. */
export const workflowDefinitionSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    title: localizedWorkflowSchema,
    subtitle: localizedWorkflowSchema,
    firstNodeId: z.string().trim().min(1).max(128),
    nodes: z.array(workflowNodeSchema).min(1).max(20),
    authoredBy: z.enum(["bundled", "web-form", "mcp"]).optional(),
    authoredAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    const ids = new Set<string>();
    for (const [index, node] of definition.nodes.entries()) {
      if (ids.has(node.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", index, "id"],
          message: "Node IDs must be unique.",
        });
      ids.add(node.id);
    }
    if (!ids.has(definition.firstNodeId))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["firstNodeId"],
        message: "The first node must exist.",
      });
    for (const [index, node] of definition.nodes.entries()) {
      const outcomes = [
        ["onConfirm", node.onConfirm],
        ["onDecline", node.onDecline],
        ["verify", node.verify?.outcome],
        ...(node.report?.options ?? []).map(
          (option) => [`report.${option.id}`, option.outcome] as const
        ),
      ] as const;
      for (const [field, outcome] of outcomes) {
        for (const target of [outcome?.opens, outcome?.resolves]) {
          if (target && !ids.has(target))
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["nodes", index, field],
              message: "Outcome targets must exist.",
            });
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
  reports?: DeskReport[];
  /** AI-written drafts saved with this browser-private case after citizen review. */
  artifactDrafts?: Partial<Record<ArtifactId, ArtifactDraft>>;
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

const bereavement: WorkflowDefinition = {
  id: "bereavement",
  title: { hi: "मृत्यु के बाद के दावे", en: "Bereavement claim" },
  subtitle: {
    hi: "Bereavement claim",
    en: "Claims after a death in the family",
  },
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
      declineLabel: {
        hi: "नहीं, बैंक में अलग है",
        en: "No, the bank has it differently",
      },
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
        hi: "क्लेम जमा करने के बाद बैंक ने क्या बताया?",
        en: "What did the bank tell you after you submitted the claim?",
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
        state: "needs-you",
        reply: {
          hi: "बैंक से मिला वास्तविक जवाब केस रिकॉर्ड में दर्ज करें।",
          en: "Record the bank's actual response in the case record.",
        },
      },
      report: {
        prompt: {
          hi: "बैंक का वास्तविक जवाब दर्ज करें",
          en: "Record the bank's actual response",
        },
        options: [
          {
            id: "signature-mismatch",
            label: {
              hi: "हस्ताक्षर मेल न खाने के कारण क्लेम लौटाया गया",
              en: "The claim was returned because the signature did not match",
            },
            reply: {
              hi: "आपका जवाब दर्ज है। प्रकाशित यात्रा अब हस्ताक्षर सुधार का समर्थित कदम दिखा सकती है।",
              en: "Your response is recorded. The published journey can now show its supported signature-correction step.",
            },
            outcome: {
              state: "blocked",
              opens: "bank-claim-fix",
              reply: {
                hi: "आपका जवाब दर्ज है। प्रकाशित यात्रा अब हस्ताक्षर सुधार का समर्थित कदम दिखा सकती है।",
                en: "Your response is recorded. The published journey can now show its supported signature-correction step.",
              },
              note: {
                hi: "नागरिक द्वारा दर्ज जवाब: हस्ताक्षर मेल नहीं खाया",
                en: "Citizen-reported response: signature did not match",
              },
            },
          },
          {
            id: "different",
            label: {
              hi: "कुछ अलग बताया गया",
              en: "The bank said something different",
            },
            reply: { hi: "जवाब दर्ज है।", en: "The response is recorded." },
          },
        ],
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
        hi: "दावा दर्ज करने के बाद EPFO से क्या जवाब मिला?",
        en: "What response did you receive from EPFO after filing the claim?",
      },
      onConfirm: {
        state: "needs-you",
        reply: {
          hi: "EPFO से मिला वास्तविक जवाब केस रिकॉर्ड में दर्ज करें।",
          en: "Record the actual response from EPFO in the case record.",
        },
      },
      report: {
        prompt: {
          hi: "EPFO का वास्तविक जवाब दर्ज करें",
          en: "Record EPFO's actual response",
        },
        options: [
          {
            id: "no-useful-response",
            label: {
              hi: "कोई उपयोगी जवाब नहीं मिला",
              en: "No useful response was received",
            },
            reply: {
              hi: "आपका अपडेट दर्ज है। अब पुष्टि किए गए रिकॉर्ड से RTI मसौदा बनाया जा सकता है।",
              en: "Your update is recorded. An RTI draft can now be prepared from the confirmed record.",
            },
            outcome: {
              state: "blocked",
              opens: "rti-draft",
              reply: {
                hi: "आपका अपडेट दर्ज है। अब पुष्टि किए गए रिकॉर्ड से RTI मसौदा बनाया जा सकता है।",
                en: "Your update is recorded. An RTI draft can now be prepared from the confirmed record.",
              },
              note: {
                hi: "नागरिक द्वारा दर्ज अपडेट: उपयोगी जवाब नहीं मिला",
                en: "Citizen-reported update: no useful response",
              },
            },
          },
          {
            id: "different",
            label: {
              hi: "कुछ अलग जवाब मिला",
              en: "A different response was received",
            },
            reply: {
              hi: "जवाब दर्ज है।",
              en: "The response is recorded.",
            },
          },
        ],
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
        hi: "क्या पुष्टि किए गए केस रिकॉर्ड से RTI मसौदा बनाऊँ?",
        en: "Create an RTI draft from the confirmed case record?",
      },
      onConfirm: {
        state: "done",
        opens: "case-done",
        resolves: "epfo-claim",
        reply: {
          hi: "RTI मसौदा Case Card में तैयार है। उसे जाँचकर स्वयं जमा करें; सहायक ने इसे भेजा नहीं है।",
          en: "The RTI draft is ready in the Case Card. Review and submit it yourself; Sahayak has not sent it.",
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
  subtitle: {
    hi: "NSP छात्रवृत्ति भुगतान खाते में नहीं पहुँचा",
    en: "An NSP payment that never arrived",
  },
  firstNodeId: "pfms-trace",
  nodes: [
    {
      id: "pfms-trace",
      type: "desk-verification",
      title: { hi: "छात्रवृत्ति का भुगतान कहाँ अटका है, जाँचें", en: "Check where your scholarship payment is stuck" },
      detail: {
        hi: "नीचे PFMS भुगतान ट्रैकर खोलें। NSP श्रेणी चुनें, आवेदन ID और स्क्रीन पर माँगा गया सत्यापन भरें। पेज न खुले, रिकॉर्ड न मिले या संदेश समझ न आए तो नीचे दी गई डेस्क सहायता लें। अभी जवाब न हो तो फ़ॉर्म न भरें—आपका स्थान सुरक्षित है। सहायक ने कोई सरकारी जाँच शुरू नहीं की है।",
        en: "Open the PFMS payment tracker below. Choose NSP, enter your application ID and complete the verification shown there. If the page is unavailable, no record appears, or the result is unclear, use the desk preparation below. If you have no response yet, leave the form empty—your place is saved. Sahayak has not started a government check.",
      },
      link: {
        url: "https://pfms.nic.in/SitePages/DBT_StatusTracker.aspx",
        action: {
          hi: "PFMS भुगतान ट्रैकर खोलें",
          en: "Open PFMS payment tracker",
        },
        collect: {
          hi: "संदेश, जाँच की तारीख और भुगतान संदर्भ सुरक्षित रखें। OTP या पूरा खाता नंबर यहाँ न लिखें।",
          en: "Keep the message, check date and payment reference. Never enter an OTP or full account number here.",
        },
      },
      visit: {
        office: {
          hi: "सहायता: अपने संस्थान की छात्रवृत्ति डेस्क",
          en: "If you need help: your institution's scholarship desk",
        },
        why: {
          hi: "पोर्टल न खुले या जवाब स्पष्ट न हो तो सही योजना विभाग और भुगतान संदेश पहचानने में सहायता माँगें। यह भुगतान स्वीकृत कराने का दावा नहीं है।",
          en: "If the portal fails or the result is unclear, ask for help identifying the scheme department and payment message. This is a request for information, not payment approval.",
        },
        carry: [
          {
            hi: "NSP आवेदन ID और योजना का नाम",
            en: "NSP application ID and scheme name",
          },
          {
            hi: "NSP स्थिति का स्क्रीनशॉट और हाल का बैंक विवरण—निजी जानकारी स्वयं रखें",
            en: "NSP status screenshot and recent bank statement—keep private details with you",
          },
        ],
        script: {
          hi: "NSP पर भुगतान जारी दिखता है लेकिन खाते में नहीं आया। कृपया भुगतान की वर्तमान स्थिति, संदर्भ और संबंधित योजना विभाग बताएँ। अगर रिकॉर्ड नहीं मिल रहा तो किससे पूछूँ?",
          en: "NSP shows released but my payment has not arrived. Please help me find its current status, reference and responsible scheme department. If no record is available, who should I ask?",
        },
        expect: {
          hi: "उत्तर या अगला संपर्क माँगें; कोई निश्चित समयसीमा या भुगतान की गारंटी नहीं है।",
          en: "Ask for an answer or the next contact; no response deadline or payment is guaranteed.",
        },
        collect: {
          hi: "जवाब के शब्द, तारीख, भुगतान/पावती संदर्भ और बताए गए कार्यालय का नाम। संदर्भ न मिले तो वह भी लिखें।",
          en: "The exact response, date, payment/acknowledgement reference and office named. If no reference is provided, record that too.",
        },
      },
      ask: {
        hi: "पोर्टल या डेस्क ने क्या बताया?",
        en: "What did the portal or desk tell you?",
      },
      onConfirm: {
        state: "needs-you",
        reply: {
          hi: "जवाब को नीचे दिए गए रिकॉर्ड में दर्ज करें।",
          en: "Record the response in the case record below.",
        },
      },
      report: {
        prompt: {
          hi: "मिला हुआ वास्तविक जवाब दर्ज करें",
          en: "Record the response you actually received",
        },
        options: [
          {
            id: "npci-missing",
            label: {
              hi: "जवाब में आधार/NPCI mapping की समस्या बताई गई",
              en: "They reported an Aadhaar/NPCI mapping issue",
            },
            reply: {
              hi: "आपका जवाब दर्ज हो गया। यह प्रकाशित यात्रा अब बैंक सीडिंग सुधार का समर्थित कदम दिखा सकती है।",
              en: "Your response is recorded. This published journey can now show its supported bank-seeding recovery step.",
            },
            outcome: {
              state: "blocked",
              opens: "bank-seeding",
              artifact: "npci-checklist",
              reply: {
                hi: "आपका जवाब दर्ज हो गया। यह प्रकाशित यात्रा अब बैंक सीडिंग सुधार का समर्थित कदम दिखा सकती है।",
                en: "Your response is recorded. This published journey can now show its supported bank-seeding recovery step.",
              },
              note: {
                hi: "नागरिक द्वारा दर्ज जवाब: NPCI mapping की समस्या",
                en: "Citizen-reported response: NPCI mapping issue",
              },
            },
          },
          {
            id: "different",
            label: {
              hi: "कुछ अलग बताया गया",
              en: "They told me something different",
            },
            reply: {
              hi: "जवाब सुरक्षित है। इसे NPCI समस्या न मानें। ऊपर दिए संस्थान/योजना संपर्क से भुगतान संदर्भ और सही अगला कदम पूछें; नया जवाब मिलने पर यहीं दर्ज करें।",
              en: "Your response is recorded. Do not assume a cause. Ask the institution/scheme contact above for the payment reference and correct next action; return here with their answer.",
            },
          },
        ],
      },
    },
    {
      id: "bank-seeding",
      type: "bank-seeding-fix",
      title: {
        hi: "बैंक से सीडिंग जाँच का अनुरोध करें",
        en: "Request a bank seeding check",
      },
      detail: {
        hi: "शाखा में जाकर खाता आधार से जुड़वाइए और NPCI mapping सक्रिय कराइए।",
        en: "Go to the branch, get the account linked to Aadhaar, and get NPCI mapping activated.",
      },
      ask: {
        hi: "शाखा में सीडिंग अनुरोध देने पर क्या हुआ?",
        en: "What happened when you gave the seeding request at the branch?",
      },
      visit: {
        office: { hi: "आपकी बैंक शाखा", en: "Your bank branch" },
        why: {
          hi: "बैंक से दर्ज NPCI समस्या की जाँच और आवश्यक सुधार का तरीका पूछें। पावती मिलना सीडिंग सक्रिय होने की पुष्टि नहीं है।",
          en: "Ask the bank to check the reported NPCI issue and explain any correction needed. An acknowledgement does not confirm activation.",
        },
        carry: [
          { hi: "पासबुक", en: "The passbook" },
          { hi: "आधार की प्रति", en: "A copy of your Aadhaar" },
          {
            hi: "छात्रवृत्ति आवेदन संख्या",
            en: "The scholarship application number",
          },
        ],
        script: {
          hi: "मेरा खाता आधार से जोड़कर NPCI mapping सक्रिय कीजिए। कृपया पावती दीजिए।",
          en: "Please link my account to Aadhaar and activate NPCI mapping. Please give me an acknowledgement.",
        },
        expect: {
          hi: "ज़रूरी दस्तावेज़ और अगली जाँच की तारीख शाखा से पूछें; समय की गारंटी नहीं है।",
          en: "Confirm required documents and a follow-up date with the branch; processing time is not guaranteed.",
        },
        collect: {
          hi: "सीडिंग अनुरोध की पावती",
          en: "The acknowledgement for the seeding request",
        },
      },
      onConfirm: {
        state: "needs-you",
        reply: {
          hi: "शाखा से मिला वास्तविक नतीजा नीचे दर्ज करें।",
          en: "Record the branch's actual response below.",
        },
      },
      report: {
        prompt: {
          hi: "शाखा का वास्तविक जवाब और पावती दर्ज करें",
          en: "Record the branch response and acknowledgement",
        },
        options: [
          {
            id: "request-acknowledged",
            label: {
              hi: "सीडिंग अनुरोध स्वीकार हुआ और पावती मिली",
              en: "The seeding request was accepted and I received an acknowledgement",
            },
            reply: {
              hi: "पावती दर्ज है। अब मिलने वाला वास्तविक भुगतान अपडेट दर्ज करें।",
              en: "The acknowledgement is recorded. Next, record the actual payment update you receive.",
            },
            outcome: {
              state: "done",
              opens: "verify-again",
              resolves: "pfms-trace",
              reply: {
                hi: "पावती दर्ज है। अब मिलने वाला वास्तविक भुगतान अपडेट दर्ज करें।",
                en: "The acknowledgement is recorded. Next, record the actual payment update you receive.",
              },
              artifact: "npci-checklist",
            },
          },
          {
            id: "could-not-submit",
            label: {
              hi: "अनुरोध जमा नहीं हो सका",
              en: "I could not submit the request",
            },
            reply: {
              hi: "नतीजा दर्ज है। सहायक इसे सफल मानकर आगे नहीं बढ़ेगा।",
              en: "The outcome is recorded. Sahayak will not treat it as successful or advance the case.",
            },
          },
        ],
      },
    },
    {
      id: "verify-again",
      type: "desk-verification",
      title: { hi: "दोबारा भुगतान जाँच", en: "Payment check again" },
      detail: {
        hi: "सीडिंग अनुरोध के बाद पोर्टल, बैंक या डेस्क से मिले वास्तविक अपडेट को दर्ज करें।",
        en: "After the seeding request, record the actual update from the portal, bank or desk.",
      },
      ask: {
        hi: "दोबारा जाँच करने पर क्या हुआ?",
        en: "What happened when you checked again?",
      },
      onConfirm: {
        state: "needs-you",
        reply: {
          hi: "मिला हुआ अपडेट नीचे दर्ज करें।",
          en: "Record the update you received below.",
        },
      },
      report: {
        prompt: {
          hi: "दोबारा जाँच का वास्तविक नतीजा दर्ज करें",
          en: "Record the actual result of checking again",
        },
        options: [
          {
            id: "still-missing",
            label: {
              hi: "भुगतान अभी भी नहीं आया या उपयोगी जवाब नहीं मिला",
              en: "Payment is still missing or no useful response was given",
            },
            reply: {
              hi: "आपका अपडेट दर्ज है। अब पुष्टि किए गए विवरण से शिकायत का मसौदा बनाया जा सकता है।",
              en: "Your update is recorded. A grievance draft can now be prepared from the confirmed case details.",
            },
            outcome: {
              state: "blocked",
              opens: "grievance",
              artifact: "escalation-draft",
              reply: {
                hi: "आपका अपडेट दर्ज है। अब पुष्टि किए गए विवरण से शिकायत का मसौदा बनाया जा सकता है।",
                en: "Your update is recorded. A grievance draft can now be prepared from the confirmed case details.",
              },
              note: {
                hi: "नागरिक द्वारा दर्ज अपडेट: भुगतान अभी भी नहीं आया",
                en: "Citizen-reported update: payment still missing",
              },
            },
          },
          {
            id: "credited",
            label: {
              hi: "भुगतान खाते में आ गया",
              en: "The payment reached my account",
            },
            reply: {
              hi: "अपडेट दर्ज है। अब नागरिक राशि आने की पुष्टि कर सकता है।",
              en: "The update is recorded. The citizen can now confirm the credit.",
            },
            outcome: {
              state: "done",
              opens: "credit",
              resolves: "pfms-trace",
              reply: {
                hi: "अपडेट दर्ज है। अब नागरिक राशि आने की पुष्टि कर सकता है।",
                en: "The update is recorded. The citizen can now confirm the credit.",
              },
            },
          },
          {
            id: "different",
            label: { hi: "कुछ अलग हुआ", en: "Something different happened" },
            reply: {
              hi: "अपडेट दर्ज है।",
              en: "The update is recorded.",
            },
          },
        ],
      },
    },
    {
      id: "grievance",
      type: "grievance-file",
      title: {
        hi: "शिकायत तैयार करें और जमा होने का रिकॉर्ड रखें",
        en: "Prepare a grievance and record submission",
      },
      detail: {
        hi: "नीचे मसौदा तैयार करें, जाँचें और डाउनलोड करें। भुगतान संबंधी शिकायत अपनी योजना के नोडल मंत्रालय/विभाग को दें। नीचे NSP का मार्गदर्शन देखकर सही विभाग और उसका माध्यम खोजें; पता न चले तो संस्थान की छात्रवृत्ति डेस्क से पूछें। कोई कार्यालय स्वयं न गढ़ें। सहायक मसौदा भेजता नहीं है।",
        en: "Prepare, review and download your draft below. Payment grievances belong with your scheme's nodal ministry/department. Use the NSP guidance below to identify the department and its submission channel; if unclear, ask your institution's scholarship desk. Do not guess a recipient. Sahayak does not send the draft.",
      },
      ask: {
        hi: "मसौदा तैयार करना जमा करना नहीं है। स्वयं जमा करने के बाद ही नीचे उसका रिकॉर्ड भरें।",
        en: "Preparing a draft is not submission. Fill the record below only after submitting it yourself.",
      },
      link: {
        url: "https://nsp.gov.in/NSPADMIN/RTIContact",
        action: {
          hi: "NSP: शिकायत किस विभाग को दें",
          en: "NSP: find the responsible grievance department",
        },
        collect: {
          hi: "योजना विभाग, जमा करने का माध्यम और मिली पावती सुरक्षित रखें।",
          en: "Keep the scheme department, submission channel and acknowledgement you receive.",
        },
      },
      onConfirm: {
        state: "needs-you",
        reply: {
          hi: "अब Case Card में शिकायत का मसौदा तैयार किया जा सकता है। उसे जाँचकर स्वयं जमा करें; सहायक इसे नहीं भेजेगा।",
          en: "The grievance can now be prepared in the Case Card. Review and submit it yourself; Sahayak will not send it.",
        },
        artifact: "escalation-draft",
      },
      report: {
        prompt: {
          hi: "स्वयं शिकायत देने के बाद रिकॉर्ड करें",
          en: "Record what happened after you submitted the grievance",
        },
        options: [
          {
            id: "submitted",
            label: {
              hi: "मैंने सही विभाग को शिकायत जमा की",
              en: "I submitted the grievance to the responsible department",
            },
            reply: {
              hi: "आपके बताए अनुसार शिकायत जमा होना दर्ज है। भुगतान अभी भी लंबित है।",
              en: "Submission is recorded as reported by you. Payment remains unresolved.",
            },
            outcome: {
              state: "done",
              opens: "credit",
              reply: {
                hi: "शिकायत जमा होने का आपका रिकॉर्ड सुरक्षित है।",
                en: "Your submission record is saved.",
              },
            },
          },
          {
            id: "could-not-submit",
            label: {
              hi: "जमा नहीं कर पाया या माध्यम स्पष्ट नहीं है",
              en: "I could not submit or the channel is unclear",
            },
            reply: {
              hi: "कोई शिकायत जमा नहीं मानी गई। NSP मार्गदर्शन या संस्थान से सही विभाग/माध्यम पूछें। मसौदा और केस सुरक्षित हैं।",
              en: "No submission is claimed. Use the NSP guidance or ask your institution for the correct department/channel. Your draft and case remain saved.",
            },
          },
        ],
      },
    },
    {
      id: "credit",
      type: "benefit-credit",
      title: {
        hi: "भुगतान आया या नहीं, जाँचें",
        en: "Check whether payment arrived",
      },
      detail: {
        hi: "सुधार के बाद खाते की जाँच करें। समस्या तभी हल मानी जाएगी जब नागरिक राशि आने की पुष्टि करे।",
        en: "Check the account after the correction. The problem is resolved only when the citizen confirms the credit.",
      },
      ask: {
        hi: "क्या खाते में राशि जमा होने की पुष्टि दर्ज कर दूँ?",
        en: "Shall I record that the money has been credited?",
      },
      confirmLabel: {
        hi: "हाँ, बैंक में राशि जमा दिख रही है",
        en: "Yes, my bank shows the credit",
      },
      declineLabel: {
        hi: "नहीं, अभी भी इंतज़ार है",
        en: "No, I am still waiting",
      },
      onDecline: {
        state: "needs-you",
        reply: {
          hi: "भुगतान लंबित ही रहेगा। जमा शिकायत के संदर्भ से उसी विभाग से अपडेट माँगें और बैंक विवरण दोबारा जाँचें। सहायक ने कोई जवाब नहीं प्राप्त किया है।",
          en: "Payment remains unresolved. Follow up with the same department using your submission reference and check your bank statement again. Sahayak has not received a response.",
        },
      },
      onConfirm: {
        state: "done",
        opens: "case-done",
        resolves: "verify-again",
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
  "punjab-income": {
    ...punjabIncome,
    nodes: [...punjabIncome.nodes, caseDoneNode],
  },
  "aadhaar-update": {
    ...aadhaarUpdate,
    nodes: [...aadhaarUpdate.nodes, caseDoneNode],
  },
  "epfo-claim": { ...epfoClaim, nodes: [...epfoClaim.nodes, caseDoneNode] },
};

export const workflowIds = Object.keys(workflows) as WorkflowId[];

/**
 * Every journey this process can run: the bundled seeds plus any user-added
 * workflow registered at runtime. The engine reads only from this registry, so
 * a custom journey runs on exactly the same transitions as a bundled one.
 */
const registry = new Map<string, WorkflowDefinition>(Object.entries(workflows));

export function registerWorkflowDefinition(
  definition: WorkflowDefinition,
  workflowVersionId?: string
): void {
  registry.set(workflowVersionId ?? definition.id, definition);
}

export function getWorkflowDefinition(
  id: string
): WorkflowDefinition | undefined {
  return registry.get(id);
}

/** Resolves the immutable definition a saved case was started with. */
export function getCaseWorkflowDefinition(
  caseSnapshot: CaseSnapshot
): WorkflowDefinition | undefined {
  return (
    registry.get(caseSnapshot.workflowVersionId) ??
    registry.get(caseSnapshot.workflowId)
  );
}

export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === "string" && value in workflows;
}

export function findNode(
  workflowId: string,
  nodeId: string
): WorkflowNode | undefined {
  return getWorkflowDefinition(workflowId)?.nodes.find(
    (node) => node.id === nodeId
  );
}

/** Step types used by both journeys — the composition proof. */
export function sharedStepTypes(): StepType[] {
  const scholarshipTypes = new Set(scholarship.nodes.map((node) => node.type));
  return [...new Set(bereavement.nodes.map((node) => node.type))].filter(
    (type) => scholarshipTypes.has(type)
  );
}

/** The blocking outcome a node can hit, if any. */
function blockingOutcome(
  node: WorkflowNode,
  caseSnapshot?: CaseSnapshot
): Outcome | undefined {
  const selectedOptionId = [...(caseSnapshot?.reports ?? [])]
    .reverse()
    .find((report) => report.stepId === node.id)?.optionId;
  const reportedOutcome = selectedOptionId
    ? node.report?.options.find((option) => option.id === selectedOptionId)
        ?.outcome
    : undefined;
  if (reportedOutcome?.state === "blocked") return reportedOutcome;
  if (node.verify?.outcome.state === "blocked") return node.verify.outcome;
  if (node.onDecline?.state === "blocked") return node.onDecline;
  return undefined;
}

/**
 * The rejection or breach note a node carries, read from the bundled seed
 * rather than from the snapshot, so no note can be supplied by a client.
 * A node that was blocked and then recovered keeps its note as evidence.
 */
export function nodeNote(
  caseSnapshot: CaseSnapshot,
  nodeId: string
): Localized | undefined {
  const entry = caseSnapshot.nodes.find((node) => node.id === nodeId);
  const definition = getCaseWorkflowDefinition(caseSnapshot)?.nodes.find(
    (node) => node.id === nodeId
  );
  const blocking = definition && blockingOutcome(definition, caseSnapshot);

  if (!entry || !blocking) return undefined;
  if (entry.state === "blocked") return blocking.note;

  const recovery = caseSnapshot.nodes.find(
    (node) => node.id === blocking.opens
  );
  return entry.state === "done" && recovery?.state === "done"
    ? blocking.note
    : undefined;
}

/** True once a node was blocked and its recovery step completed. */
export function isClearedBlocker(
  caseSnapshot: CaseSnapshot,
  nodeId: string
): boolean {
  const entry = caseSnapshot.nodes.find((node) => node.id === nodeId);
  return (
    entry?.state === "done" && nodeNote(caseSnapshot, nodeId) !== undefined
  );
}

export function startCase(
  workflowId: string,
  workflowVersionId = `${workflowId}-v1`
): CaseSnapshot {
  const workflow =
    registry.get(workflowVersionId) ?? getWorkflowDefinition(workflowId);
  if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);

  return {
    workflowId,
    workflowVersionId,
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      state: node.id === workflow.firstNodeId ? "needs-you" : "pending",
    })),
    artifacts: [],
    reports: [],
    day: 0,
  };
}

export type RecordDeskReportInput = Omit<DeskReport, "stepId" | "synthetic">;

/** Records citizen evidence first; only a configured option may move the case. */
export function recordDeskReport(
  caseSnapshot: CaseSnapshot,
  input: RecordDeskReportInput
): EngineResult {
  const definition = getCaseWorkflowDefinition(caseSnapshot);
  const paused = definition && unmatchedResponse(caseSnapshot, definition);
  const entry = caseSnapshot.nodes.find(
    (node) => paused ? node.id === paused.stepId : node.state === "needs-you" || node.state === "verifying"
  );
  const node =
    entry && definition?.nodes.find((candidate) => candidate.id === entry.id);
  const option = node?.report?.options.find(
    (candidate) => candidate.id === input.optionId
  );

  if (!entry || !node?.report || !option) {
    throw new Error("DESK_REPORT_NOT_ALLOWED");
  }

  const report: DeskReport = {
    ...input,
    stepId: node.id,
    synthetic: isSyntheticSeed(caseSnapshot.workflowId),
  };
  const withReport = {
    ...caseSnapshot,
    reports: [...(caseSnapshot.reports ?? []), report],
  };

  return {
    caseSnapshot: option.outcome
      ? applyOutcome(withReport, node.id, option.outcome)
      : option.id === "different"
        ? { ...withReport, nodes: withReport.nodes.map(entry => entry.id === node.id ? { ...entry, state: "blocked" as const } : entry) }
        : paused
          ? { ...withReport, nodes: withReport.nodes.map(entry => entry.id === node.id ? { ...entry, state: "needs-you" as const } : entry) }
          : withReport,
    reply: option.id === "different" && !option.outcome ? unmatchedGuidance.detail : option.reply,
  };
}

export function isSyntheticSeed(workflowId: string): boolean {
  return Object.hasOwn(workflows, workflowId);
}

/** The node the citizen is being asked about right now. */
export function currentNode(
  caseSnapshot: CaseSnapshot
): WorkflowNode | undefined {
  const definition = getCaseWorkflowDefinition(caseSnapshot);
  return definition ? caseAction(caseSnapshot, definition) : undefined;
}

function applyOutcome(
  caseSnapshot: CaseSnapshot,
  nodeId: string,
  outcome: Outcome
): CaseSnapshot {
  return {
    ...caseSnapshot,
    nodes: caseSnapshot.nodes.map((node) => {
      if (node.id === nodeId) {
        return {
          ...node,
          state: outcome.state,
          startedDay:
            outcome.state === "verifying" ? caseSnapshot.day : undefined,
        };
      }
      if (node.id === outcome.resolves) return { ...node, state: "done" };
      if (node.id === outcome.opens) return { ...node, state: "needs-you" };
      return node;
    }),
    artifacts:
      outcome.artifact && !caseSnapshot.artifacts.includes(outcome.artifact)
        ? [...caseSnapshot.artifacts, outcome.artifact]
        : caseSnapshot.artifacts,
  };
}

/** Replies the engine itself produces, outside any node's content. */
const engineReplies = {
  waiting: {
    hi: "यह पुराना केस नागरिक द्वारा दर्ज अपडेट का इंतज़ार कर रहा है।",
    en: "This older example case is waiting for a citizen-recorded update.",
  },
  allDone: {
    hi: "इस केस के सारे कदम पूरे हो चुके हैं। आपका Case Card तैयार है।",
    en: "Every step in this case is done. Your Case Card is ready.",
  },
  noReplyYet: {
    hi: "कृत्रिम समय आगे बढ़ा है; कोई वास्तविक जवाब प्राप्त नहीं हुआ।",
    en: "Demo time advanced; no real response was received.",
  },
  nothingPending: {
    hi: "अभी कोई जाँच लंबित नहीं है, इसलिए समय नहीं बदला।",
    en: "No check is pending, so simulated time did not change.",
  },
} satisfies Record<string, Localized>;

export type EngineResult = { caseSnapshot: CaseSnapshot; reply: Localized };

/** Applies an explicit choice; free-text questions are handled by the AI help route. */
export function applyIntent(
  caseSnapshot: CaseSnapshot,
  intent: Intent
): EngineResult {
  const definition = getCaseWorkflowDefinition(caseSnapshot);
  if (definition && unmatchedResponse(caseSnapshot, definition)) {
    return { caseSnapshot, reply: unmatchedGuidance.detail };
  }
  const node = currentNode(caseSnapshot);

  if (!node) {
    const waiting = caseSnapshot.nodes.some(
      (entry) => entry.state === "verifying"
    );
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
  const verifying = caseSnapshot.nodes.find(
    (node) => node.state === "verifying"
  );

  if (!verifying) {
    return { caseSnapshot, reply: engineReplies.nothingPending };
  }

  const day = caseSnapshot.day + 1;
  const definition = getCaseWorkflowDefinition(caseSnapshot)?.nodes.find(
    (node) => node.id === verifying.id
  );

  const elapsed = day - (verifying.startedDay ?? 0);

  if (!definition?.verify || elapsed < definition.verify.slaDays) {
    return {
      caseSnapshot: { ...caseSnapshot, day },
      reply: engineReplies.noReplyYet,
    };
  }

  return {
    caseSnapshot: {
      ...applyOutcome(caseSnapshot, verifying.id, definition.verify.outcome),
      day,
    },
    reply: definition.verify.outcome.reply,
  };
}
