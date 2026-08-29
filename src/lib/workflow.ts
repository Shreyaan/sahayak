import { readIntent, type Intent } from "./intent";

/**
 * The reusable typed step library. A workflow node names one of these types and
 * supplies its own content, so both journeys are powered by the same engine.
 */
export type StepType =
  | "document-explain"
  | "identity-compare"
  | "document-correction"
  | "office-visit"
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
  office: string;
  why: string;
  carry: string[];
  script: string;
  expect: string;
  collect: string;
};

/** What one node does when an event resolves it. */
type Outcome = {
  /** State this node moves to. */
  state: NodeState;
  /** Node opened for the citizen next. */
  opens?: string;
  /** A blocked node this outcome clears, so recovery closes what it recovered from. */
  resolves?: string;
  reply: string;
  artifact?: ArtifactId;
  note?: string;
};

export type WorkflowNode = {
  id: string;
  type: StepType;
  title: string;
  detail: string;
  /** The clerk's question while this node is the current action. */
  ask: string;
  visit?: VisitCard;
  onConfirm: Outcome;
  onDecline?: Outcome;
  /** Desk verification: what the simulated desk returns after `slaDays`. */
  verify?: { slaDays: number; outcome: Outcome };
};

export type WorkflowDefinition = {
  id: WorkflowId;
  title: string;
  subtitle: string;
  firstNodeId: string;
  nodes: WorkflowNode[];
};

export type WorkflowId = "bereavement" | "scholarship";

export type CaseNode = {
  id: string;
  state: NodeState;
  /** Simulated day this node entered `verifying`, so each SLA clock is its own. */
  startedDay?: number;
};

export type CaseSnapshot = {
  workflowId: WorkflowId;
  nodes: CaseNode[];
  artifacts: ArtifactId[];
  /** Simulated days elapsed. Demo time maps one simulated day to ten seconds. */
  day: number;
};

const bereavement: WorkflowDefinition = {
  id: "bereavement",
  title: "मृत्यु के बाद के दावे",
  subtitle: "Bereavement claim",
  firstNodeId: "form4-explain",
  nodes: [
    {
      id: "form4-explain",
      type: "document-explain",
      title: "Form 4 समझें",
      detail: "Form 4 अस्पताल की मृत्यु सूचना है। बैंक और EPFO दोनों इसी से नाम मिलाते हैं।",
      ask: "मैंने आपका Form 4 पढ़ लिया है। क्या मैं आगे बढ़ूँ?",
      onConfirm: {
        state: "done",
        opens: "name-check",
        reply: "ठीक है। अब नाम मिलान करते हैं।",
      },
    },
    {
      id: "name-check",
      type: "identity-compare",
      title: "नाम की पुष्टि",
      detail: "Form 4 में नाम Shyam Sunder है। बैंक रिकॉर्ड में Shyam Sundar दर्ज है।",
      ask: "Form 4 में नाम Shyam Sunder लिखा है। क्या यह सही है?",
      onConfirm: {
        state: "done",
        opens: "bank-claim",
        reply: "ठीक है। अब बैंक क्लेम तैयार करते हैं।",
      },
      onDecline: {
        state: "blocked",
        opens: "name-correction",
        reply: "समझ गया। नाम मेल नहीं खाता, इसलिए पहले सुधार पत्र बनाना होगा।",
        note: "Form 4: Shyam Sunder · बैंक: Shyam Sundar",
      },
    },
    {
      id: "name-correction",
      type: "document-correction",
      title: "नाम सुधार घोषणा",
      detail: "एक सुधार घोषणा बनाइए जिसमें दोनों वर्तनी एक ही व्यक्ति की बताई गई हों।",
      ask: "मैंने सुधार घोषणा का मसौदा तैयार कर दिया है। क्या इसे केस में जोड़ दूँ?",
      onConfirm: {
        state: "done",
        opens: "bank-claim",
        resolves: "name-check",
        reply: "सुधार घोषणा केस में जुड़ गई। अब बैंक क्लेम तैयार करते हैं।",
        artifact: "correction-declaration",
      },
    },
    {
      id: "bank-claim",
      type: "desk-verification",
      title: "बैंक क्लेम जमा करें",
      detail: "बैंक शाखा में क्लेम फ़ॉर्म और सुधार घोषणा जमा कीजिए।",
      ask: "क्या आपने बैंक शाखा में क्लेम जमा कर दिया है?",
      visit: {
        office: "भारतीय स्टेट बैंक — मुख्य शाखा (नमूना)",
        why: "मृत्यु दावे पर मूल हस्ताक्षर शाखा में ही लिए जाते हैं।",
        carry: ["Form 4 की प्रति", "नाम सुधार घोषणा", "अपना पहचान पत्र", "पासबुक"],
        script: "मुझे खाताधारक की मृत्यु के बाद दावा जमा करना है। कृपया पावती दीजिए।",
        expect: "लगभग 40 मिनट",
        collect: "पावती रसीद और उस पर दर्ज संदर्भ संख्या",
      },
      onConfirm: {
        state: "verifying",
        reply: "क्लेम जमा हो गया। बैंक की जाँच शुरू है — मैं नज़र रखता हूँ।",
      },
      verify: {
        slaDays: 2,
        outcome: {
          state: "blocked",
          opens: "bank-claim-fix",
          reply: "बैंक ने दावा लौटा दिया है। कारण: हस्ताक्षर मेल नहीं खाया।",
          note: "अस्वीकृति (नमूना): हस्ताक्षर मेल नहीं खाया",
        },
      },
    },
    {
      id: "bank-claim-fix",
      type: "document-correction",
      title: "अस्वीकृति ठीक करें",
      detail: "बैंक को संबोधित एक पत्र बनाइए जिसमें हस्ताक्षर अंतर की पुष्टि हो।",
      ask: "मैंने बैंक के लिए पत्र तैयार कर दिया है। क्या इसे जोड़कर आगे बढ़ें?",
      onConfirm: {
        state: "done",
        opens: "epfo-claim",
        resolves: "bank-claim",
        reply: "पत्र जुड़ गया। अब EPFO नॉमिनी दावा आगे बढ़ाते हैं।",
        artifact: "bank-letter",
      },
    },
    {
      id: "epfo-claim",
      type: "desk-verification",
      title: "EPFO नॉमिनी दावा",
      detail: "EPFO कार्यालय में नॉमिनी दावा दर्ज कीजिए।",
      ask: "क्या EPFO नॉमिनी दावा दर्ज हो गया है?",
      onConfirm: {
        state: "verifying",
        reply: "दावा दर्ज हो गया। तय समय-सीमा पर मैं नज़र रखता हूँ।",
      },
      verify: {
        slaDays: 3,
        outcome: {
          state: "blocked",
          opens: "rti-draft",
          reply: "तय समय-सीमा निकल गई और कोई जवाब नहीं आया। अब escalation का हक़ बनता है।",
          note: "समय-सीमा पार (नमूना): 3 दिन",
        },
      },
    },
    {
      id: "rti-draft",
      type: "rti-escalate",
      title: "RTI मसौदा तैयार करें",
      detail: "देरी के लिए एक सामान्य RTI आवेदन। यह सामान्य विलंब है, इसलिए 48-घंटे वाला जीवन-स्वतंत्रता प्रावधान लागू नहीं है।",
      ask: "मैंने RTI का मसौदा तैयार किया है। क्या इसे केस में क़तार में रख दूँ?",
      onConfirm: {
        state: "done",
        opens: "case-done",
        resolves: "epfo-claim",
        reply: "RTI मसौदा क़तार में है। भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
        artifact: "rti-draft",
      },
    },
    {
      id: "case-done",
      type: "case-complete",
      title: "केस सार तैयार",
      detail: "आपका Case Card बन गया है। इसे प्रिंट या साझा कर सकते हैं।",
      ask: "क्या मैं आपका Case Card तैयार कर दूँ?",
      onConfirm: {
        state: "done",
        reply: "Case Card तैयार है। ऊपर से खोलकर प्रिंट कर सकते हैं।",
      },
    },
  ],
};

const scholarship: WorkflowDefinition = {
  id: "scholarship",
  title: "अटकी हुई छात्रवृत्ति",
  subtitle: "Stuck NSP scholarship",
  firstNodeId: "nsp-status",
  nodes: [
    {
      id: "nsp-status",
      type: "document-explain",
      title: "NSP स्थिति समझें",
      detail: "पोर्टल पर 'Released to PFMS' दिखता है, पर खाते में पैसा नहीं आया। इसका मतलब भुगतान बैंक स्तर पर अटका है।",
      ask: "आपकी स्थिति 'Released to PFMS' दिख रही है पर पैसा नहीं आया। क्या मैं कारण ढूँढूँ?",
      onConfirm: {
        state: "done",
        opens: "pfms-trace",
        reply: "ठीक है। PFMS की तरफ़ से भुगतान की स्थिति देखते हैं।",
      },
    },
    {
      id: "pfms-trace",
      type: "desk-verification",
      title: "PFMS भुगतान जाँच",
      detail: "PFMS से भुगतान की वापसी का कारण मँगाया जाता है।",
      ask: "क्या मैं PFMS भुगतान जाँच शुरू कर दूँ?",
      onConfirm: {
        state: "verifying",
        reply: "जाँच शुरू है। कारण मिलते ही बताता हूँ।",
      },
      verify: {
        slaDays: 1,
        outcome: {
          state: "blocked",
          opens: "bank-seeding",
          reply: "कारण मिल गया: बैंक ने भुगतान लौटा दिया — खाता आधार से नहीं जुड़ा (NPCI)।",
          note: "छिपा कारण (नमूना): NPCI mapping न होना",
        },
      },
    },
    {
      id: "bank-seeding",
      type: "bank-seeding-fix",
      title: "बैंक खाता सीडिंग ठीक करें",
      detail: "शाखा में जाकर खाता आधार से जुड़वाइए और NPCI mapping सक्रिय कराइए।",
      ask: "क्या आपने शाखा में खाता सीडिंग का अनुरोध दे दिया है?",
      visit: {
        office: "आपकी बैंक शाखा (नमूना)",
        why: "NPCI mapping शाखा से ही सक्रिय होती है, पोर्टल से नहीं।",
        carry: ["पासबुक", "आधार की प्रति", "छात्रवृत्ति आवेदन संख्या"],
        script: "मेरा खाता आधार से जोड़कर NPCI mapping सक्रिय कीजिए। कृपया पावती दीजिए।",
        expect: "लगभग 30 मिनट",
        collect: "सीडिंग अनुरोध की पावती",
      },
      onConfirm: {
        state: "done",
        opens: "verify-again",
        resolves: "pfms-trace",
        reply: "सीडिंग अनुरोध दर्ज हो गया। अब दोबारा भुगतान जाँच लगाते हैं।",
        artifact: "npci-checklist",
      },
    },
    {
      id: "verify-again",
      type: "desk-verification",
      title: "दोबारा भुगतान जाँच",
      detail: "सीडिंग ठीक होने के बाद भुगतान दोबारा जाँचा जाता है।",
      ask: "क्या मैं दोबारा भुगतान जाँच लगा दूँ?",
      onConfirm: {
        state: "verifying",
        reply: "दोबारा जाँच लगी है। समय-सीमा पर नज़र है।",
      },
      verify: {
        slaDays: 3,
        outcome: {
          state: "blocked",
          opens: "grievance",
          reply: "तय समय-सीमा निकल गई। अब NSP शिकायत दर्ज करने का हक़ बनता है।",
          note: "समय-सीमा पार (नमूना): 3 दिन",
        },
      },
    },
    {
      id: "grievance",
      type: "grievance-file",
      title: "NSP शिकायत दर्ज करें",
      detail: "पोर्टल पर शिकायत का मसौदा, जिसमें सीडिंग पावती संदर्भ जुड़ा है।",
      ask: "मैंने शिकायत का मसौदा तैयार किया है। क्या इसे क़तार में रख दूँ?",
      onConfirm: {
        state: "done",
        opens: "credit",
        resolves: "verify-again",
        reply: "शिकायत मसौदा क़तार में है। भेजने से पहले आपकी मंज़ूरी ली जाएगी।",
        artifact: "escalation-draft",
      },
    },
    {
      id: "credit",
      type: "benefit-credit",
      title: "राशि खाते में",
      detail: "सुधार के बाद छात्रवृत्ति राशि खाते में जमा हो जाती है (नमूना)।",
      ask: "क्या खाते में राशि जमा होने की पुष्टि दर्ज कर दूँ?",
      onConfirm: {
        state: "done",
        opens: "case-done",
        reply: "राशि जमा दर्ज हो गई (नमूना)।",
      },
    },
    {
      id: "case-done",
      type: "case-complete",
      title: "केस सार तैयार",
      detail: "आपका Case Card बन गया है। इसे प्रिंट या साझा कर सकते हैं।",
      ask: "क्या मैं आपका Case Card तैयार कर दूँ?",
      onConfirm: {
        state: "done",
        reply: "Case Card तैयार है। ऊपर से खोलकर प्रिंट कर सकते हैं।",
      },
    },
  ],
};

export const workflows: Record<WorkflowId, WorkflowDefinition> = {
  bereavement,
  scholarship,
};

export const workflowIds = Object.keys(workflows) as WorkflowId[];

export function isWorkflowId(value: unknown): value is WorkflowId {
  return typeof value === "string" && value in workflows;
}

export function findNode(workflowId: WorkflowId, nodeId: string): WorkflowNode | undefined {
  return workflows[workflowId].nodes.find((node) => node.id === nodeId);
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
export function nodeNote(caseSnapshot: CaseSnapshot, nodeId: string): string | undefined {
  const entry = caseSnapshot.nodes.find((node) => node.id === nodeId);
  const definition = findNode(caseSnapshot.workflowId, nodeId);
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

export function startCase(workflowId: WorkflowId): CaseSnapshot {
  const workflow = workflows[workflowId];

  return {
    workflowId,
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
  return open && findNode(caseSnapshot.workflowId, open.id);
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

export type EngineResult = { caseSnapshot: CaseSnapshot; reply: string };

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
      reply: waiting
        ? "अभी जाँच चल रही है। जवाब आते ही मैं बताऊँगा।"
        : "इस केस के सारे कदम पूरे हो चुके हैं। आपका Case Card तैयार है।",
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
 * Advances simulated time by one day and releases any desk verification whose
 * clock has expired. Demo mode is deterministic: no randomness is used.
 */
export function advanceDay(caseSnapshot: CaseSnapshot): EngineResult {
  const day = caseSnapshot.day + 1;
  const verifying = caseSnapshot.nodes.find((node) => node.state === "verifying");
  const definition = verifying && findNode(caseSnapshot.workflowId, verifying.id);

  const elapsed = day - (verifying?.startedDay ?? 0);

  if (!verifying || !definition?.verify || elapsed < definition.verify.slaDays) {
    return {
      caseSnapshot: { ...caseSnapshot, day },
      reply: verifying
        ? "अभी तक कोई जवाब नहीं आया। मैं नज़र रखे हुए हूँ।"
        : "समय आगे बढ़ा। अभी कोई जाँच लंबित नहीं है।",
    };
  }

  return {
    caseSnapshot: { ...applyOutcome(caseSnapshot, verifying.id, definition.verify.outcome), day },
    reply: definition.verify.outcome.reply,
  };
}
