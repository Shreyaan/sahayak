import { t, type Locale, type Localized } from "./locale";
import { assignWorkflowId, type WorkflowStepSpec } from "./custom-workflow";
import { jurisdictionSuggestionSchema } from "./india-locations";
import { localizedSchema } from "./review-case";
import { workflows, caseDoneNode, workflowDefinitionSchema, type StepType, type WorkflowDefinition, type WorkflowId } from "./workflow";
import { z } from "zod";

export type ContributionConflict = {
  field: Localized;
  submitted: Localized;
  bundled: Localized;
  reason: Localized;
};

export type ContributionDraft = {
  workflowId: string;
  definition: WorkflowDefinition;
  title: Localized;
  summary: Localized;
  steps: Localized[];
  matches: Localized[];
  additions: Localized[];
  conflicts: ContributionConflict[];
  sourceType: "lived experience";
};

export const generatedContributionSchema = z.object({
  title: localizedSchema,
  summary: localizedSchema,
  steps: z.array(z.object({
    title: localizedSchema,
    detail: localizedSchema,
    ask: localizedSchema,
    kind: z.enum(["confirm", "visit", "desk"]),
  }).strict()).min(1).max(12),
  reviewFlags: z.array(localizedSchema).max(12),
  jurisdiction: jurisdictionSuggestionSchema,
}).strict();

export type GeneratedContribution = z.infer<typeof generatedContributionSchema>;

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
  summary: (journey: string) => string;
  match: (step: string, journey: string) => string;
  step: (title: string, detail: string) => string;
}> = {
  hi: {
    title: (journey) => `${journey} — योगदान`,
    summary: (journey) => `${journey} के अनुभव से बना समीक्षा मसौदा।`,
    match: (step, journey) => `“${step}” पहले से “${journey}” यात्रा में शामिल है।`,
    step: (title, detail) => `${title} — ${detail}`,
  },
  en: {
    title: (journey) => `${journey} contribution`,
    summary: (journey) => `A review draft based on a lived ${journey} experience.`,
    match: (step, journey) => `“${step}” is already part of the bundled ${journey} workflow.`,
    step: (title, detail) => `${title} — ${detail}`,
  },
};

const journeySignals: Record<WorkflowId, RegExp> = {
  scholarship: /\b(?:scholarship|nsp|pfms|npci|seeding)\b|छात्रवृत्ति|वजीफ़ा/i,
  bereavement: /\b(?:form\s*4|death|died|bereave(?:ment)?|nominee|epfo)\b|मृत्यु|निधन/i,
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

function detectWorkflow(input: string): WorkflowId | undefined {
  return (Object.entries(journeySignals) as Array<[WorkflowId, RegExp]>)
    .find(([, signal]) => signal.test(input))?.[0];
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

/**
 * Compiles a synthetic lived experience into a reviewable draft by comparing it
 * against the bundled workflow seeds. Deterministic: the AI may enrich wording,
 * but matches and conflicts are decided here.
 */
export function compileContribution(input: string): ContributionDraft {
  const workflowId = detectWorkflow(input);
  if (!workflowId) throw new Error("UNSUPPORTED_CONTRIBUTION");
  const workflow = workflows[workflowId];

  const matchedNodes = workflow.nodes.filter((node) => stepSignals[node.type]?.test(input));
  const matches = matchedNodes.map((node) =>
    localized((locale) => phrases[locale].match(t(node.title, locale), t(workflow.title, locale))),
  );

  const additions = additionSignals
    .filter(({ signal }) => signal.test(input))
    .map(({ note }) => note);

  const conflicts = findConflicts(input);

  const title = localized((locale) => phrases[locale].title(t(workflow.title, locale)));
  const summary = localized((locale) => phrases[locale].summary(t(workflow.title, locale)));
  const definition: WorkflowDefinition = { ...structuredClone(workflow), title, subtitle: summary };

  return {
    workflowId,
    definition,
    title,
    summary,
    steps: definition.nodes.map((node) =>
      localized((locale) => phrases[locale].step(t(node.title, locale), t(node.detail, locale))),
    ),
    matches,
    additions,
    conflicts,
    sourceType: "lived experience",
  };
}

const stepTypeFor = (kind: GeneratedContribution["steps"][number]["kind"]): StepType => {
  if (kind === "visit") return "office-visit";
  if (kind === "desk") return "desk-verification";
  return "document-explain";
};

/** Turns model-extracted evidence into the same deterministic review shape as seeded comparisons. */
export function compileGeneratedContribution(generated: GeneratedContribution): ContributionDraft {
  const workflowId = assignWorkflowId({
    title: generated.title.en,
    subtitle: generated.summary.en,
    steps: generated.steps.map((step) => ({ title: step.title.en, detail: step.detail.en, ask: step.ask.en, kind: step.kind })),
  }, new Set(Object.keys(workflows)));

  const nodes = generated.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    type: stepTypeFor(step.kind),
    title: step.title,
    detail: step.detail,
    ask: step.ask,
    onConfirm: {
      state: "done" as const,
      opens: index === generated.steps.length - 1 ? "case-done" : `step-${index + 2}`,
      reply: {
        hi: "यह बताया गया कदम दर्ज हो गया। अगला कदम देखें।",
        en: "This reported step is recorded. Review the next step.",
      },
    },
  }));

  const definition = workflowDefinitionSchema.parse({
    id: workflowId,
    title: generated.title,
    subtitle: generated.summary,
    firstNodeId: nodes[0]!.id,
    nodes: [...nodes, caseDoneNode],
    authoredBy: "web-form",
  });

  const expertVerification = {
    hi: "प्रकाशित करने से पहले पूरी यात्रा और हर सरकारी निर्देश की विशेषज्ञ जाँच आवश्यक है।",
    en: "Expert verification of the full journey and every government instruction is required before publication.",
  };

  return {
    workflowId,
    definition,
    title: generated.title,
    summary: generated.summary,
    steps: generated.steps.map((step) => step.title),
    matches: [],
    additions: [...generated.reviewFlags, expertVerification],
    conflicts: [],
    sourceType: "lived experience",
  };
}
