import { recordCorroboration } from "./corroboration";
import { t, type Locale, type Localized } from "./locale";
import { workflows, type StepType, type WorkflowId } from "./workflow";

export type ContributionConflict = {
  field: Localized;
  submitted: Localized;
  bundled: Localized;
  reason: Localized;
};

/**
 * A contribution never becomes authoritative here. It reaches `publishable
 * draft` only once corroborated and free of unresolved conflicts, and even then
 * publication is simulated.
 */
export type ContributionStatus = "draft" | "needs review" | "publishable draft";

export type ContributionDraft = {
  workflowId: WorkflowId;
  title: Localized;
  steps: Localized[];
  matches: Localized[];
  additions: Localized[];
  conflicts: ContributionConflict[];
  sourceType: "lived experience";
  corroborationCount: number;
  status: ContributionStatus;
};

/** A value that reads the same in every language, such as a name on a form. */
function same(value: string): Localized {
  return { hi: value, en: value };
}

/** Renders the same sentence once per language. */
function localized(build: (locale: Locale) => string): Localized {
  return { hi: build("hi"), en: build("en") };
}

/** Sentence templates the compiler fills with localized workflow content. */
const phrases: Record<Locale, {
  title: (journey: string) => string;
  match: (step: string, journey: string) => string;
  step: (title: string, detail: string) => string;
}> = {
  hi: {
    title: (journey) => `${journey} — योगदान`,
    match: (step, journey) => `“${step}” पहले से “${journey}” यात्रा में शामिल है।`,
    step: (title, detail) => `${title} — ${detail}`,
  },
  en: {
    title: (journey) => `${journey} contribution`,
    match: (step, journey) => `“${step}” is already part of the bundled ${journey} workflow.`,
    step: (title, detail) => `${title} — ${detail}`,
  },
};

const journeySignals: Record<WorkflowId, RegExp> = {
  scholarship: /scholarship|nsp|pfms|npci|seeding|छात्रवृत्ति|वजीफ़ा/i,
  bereavement: /form\s*4|death|died|bereave|nominee|epfo|मृत्यु|निधन/i,
};

/** Signals shared by both journeys, matching the reusable step types. */
const stepSignals: Partial<Record<StepType, RegExp>> = {
  "document-explain": /form\s*4|status|released|स्थिति/i,
  "identity-compare": /name|spelling|नाम|वर्तनी/i,
  "document-correction": /correction|declaration|affidavit|letter|सुधार|घोषणा|पत्र/i,
  "desk-verification": /bank|claim|verif|epfo|दावा|जाँच|बैंक/i,
  "bank-seeding-fix": /seeding|npci|aadhaar|आधार|सीडिंग/i,
  "grievance-file": /grievance|complaint|शिकायत/i,
  "rti-escalate": /rti|आरटीआई/i,
  "benefit-credit": /credit|amount|राशि|जमा/i,
};

const additionSignals: Array<{ signal: RegExp; note: Localized }> = [
  {
    signal: /office|counter|branch|कार्यालय|काउंटर|शाखा/i,
    note: {
      hi: "बताई गई दफ़्तर की यात्रा को यात्रा में जोड़ने से पहले जाँच लें।",
      en: "Review the reported office visit before adding it to the workflow.",
    },
  },
  {
    signal: /fee|charge|₹|रुपये|शुल्क/i,
    note: {
      hi: "बताया गया भुगतान बंडल की गई यात्रा में नहीं है। प्रकाशित करने से पहले जाँच लें।",
      en: "A reported payment is not in the bundled workflow. Verify before publishing.",
    },
  },
  {
    signal: /agent|dalal|दलाल|एजेंट/i,
    note: {
      hi: "बताया गया बिचौलिया किसी भी सरकारी कदम का हिस्सा नहीं है। समीक्षा के लिए चिह्नित करें।",
      en: "A reported middleman is not part of any official step. Flag for review.",
    },
  },
  {
    signal: /photocopy|xerox|notary|फोटोकॉपी|नोटरी/i,
    note: {
      hi: "बताए गए अतिरिक्त काग़ज़ों को जोड़ने से पहले जाँच लें।",
      en: "Review the reported extra paperwork before adding it.",
    },
  },
];

const bundledName = "Shyam Sunder";

function detectWorkflow(input: string): WorkflowId {
  return journeySignals.scholarship.test(input) ? "scholarship" : "bereavement";
}

function findConflicts(input: string): ContributionConflict[] {
  const conflicts: ContributionConflict[] = [];

  if (/shyam\s+sundar/i.test(input)) {
    conflicts.push({
      field: { hi: "नाम की वर्तनी", en: "Name spelling" },
      submitted: same("Shyam Sundar"),
      bundled: same(bundledName),
      reason: {
        hi: "भेजा गया नाम बंडल किए गए मृत्यु-दावा स्रोत से अलग है।",
        en: "The submitted name differs from the bundled bereavement seed.",
      },
    });
  }

  if (/48\s*(?:hour|hrs|घंटे)/i.test(input)) {
    conflicts.push({
      field: { hi: "RTI समय-सीमा", en: "RTI timeline" },
      submitted: {
        hi: "सामान्य देरी के लिए 48 घंटे",
        en: "48 hours for an ordinary delay",
      },
      bundled: {
        hi: "48 घंटे की समय-सीमा जीवन या स्वतंत्रता के मामलों की है, सामान्य देरी की नहीं",
        en: "The 48-hour life-or-liberty period does not apply to ordinary delay",
      },
      reason: {
        hi: "बंडल किया गया स्रोत कहता है कि यह समय-सीमा सामान्य देरी पर लागू नहीं होती।",
        en: "The bundled source marks this period as inapplicable to routine delay.",
      },
    });
  }

  return conflicts;
}

function resolveStatus(corroborationCount: number, conflicts: number): ContributionStatus {
  if (conflicts > 0) return "needs review";
  return corroborationCount >= 2 ? "publishable draft" : "draft";
}

/**
 * Compiles a synthetic lived experience into a reviewable draft by comparing it
 * against the bundled workflow seeds. Deterministic: the AI may enrich wording,
 * but matches, conflicts, corroboration, and status are decided here.
 */
export function compileContribution(input: string): ContributionDraft {
  const workflowId = detectWorkflow(input);
  const workflow = workflows[workflowId];

  const matchedNodes = workflow.nodes.filter((node) => stepSignals[node.type]?.test(input));
  const matches = matchedNodes.map((node) =>
    localized((locale) => phrases[locale].match(t(node.title, locale), t(workflow.title, locale))),
  );

  const additions = additionSignals
    .filter(({ signal }) => signal.test(input))
    .map(({ note }) => note);

  const conflicts = findConflicts(input);

  // Contributors describing the same steps of the same journey corroborate each other.
  const claimKey = `${workflowId}:${matchedNodes.map((node) => node.id).sort().join(",")}`;
  const corroborationCount = recordCorroboration(claimKey);

  const stepNodes = matchedNodes.length ? matchedNodes : workflow.nodes.slice(0, 2);

  return {
    workflowId,
    title: localized((locale) => phrases[locale].title(t(workflow.title, locale))),
    steps: stepNodes.map((node) =>
      localized((locale) => phrases[locale].step(t(node.title, locale), t(node.detail, locale))),
    ),
    matches,
    additions,
    conflicts,
    sourceType: "lived experience",
    corroborationCount,
    status: resolveStatus(corroborationCount, conflicts.length),
  };
}
