import { type Localized } from "./locale";
import { jurisdictionSuggestionSchema } from "./india-locations";
import { localizedSchema } from "./review-case";
import { caseDoneNode, workflowDefinitionSchema, type StepType, type WorkflowDefinition } from "./workflow";
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

const stepTypeFor = (kind: GeneratedContribution["steps"][number]["kind"]): StepType => {
  if (kind === "visit") return "office-visit";
  if (kind === "desk") return "desk-verification";
  return "document-explain";
};

/** Turns model-extracted evidence into the a validated, unpublished review definition. */
export function compileGeneratedContribution(generated: GeneratedContribution): ContributionDraft {
  generated = generatedContributionSchema.parse(generated);
  const workflowId = `custom-${crypto.randomUUID()}`;

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
