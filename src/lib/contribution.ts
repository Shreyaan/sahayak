import { recordCorroboration } from "./corroboration";
import { workflows, type StepType, type WorkflowId } from "./workflow";

export type ContributionConflict = {
  field: string;
  submitted: string;
  bundled: string;
  reason: string;
};

/**
 * A contribution never becomes authoritative here. It reaches `publishable
 * draft` only once corroborated and free of unresolved conflicts, and even then
 * publication is simulated.
 */
export type ContributionStatus = "draft" | "needs review" | "publishable draft";

export type ContributionDraft = {
  workflowId: WorkflowId;
  title: string;
  steps: string[];
  matches: string[];
  additions: string[];
  conflicts: ContributionConflict[];
  sourceType: "lived experience";
  corroborationCount: number;
  status: ContributionStatus;
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

const additionSignals: Array<{ signal: RegExp; note: string }> = [
  { signal: /office|counter|branch|कार्यालय|काउंटर|शाखा/i, note: "Review the reported office visit before adding it to the workflow." },
  { signal: /fee|charge|₹|रुपये|शुल्क/i, note: "A reported payment is not in the bundled workflow. Verify before publishing." },
  { signal: /agent|dalal|दलाल|एजेंट/i, note: "A reported middleman is not part of any official step. Flag for review." },
  { signal: /photocopy|xerox|notary|फोटोकॉपी|नोटरी/i, note: "Review the reported extra paperwork before adding it." },
];

const bundledName = "Shyam Sunder";

function detectWorkflow(input: string): WorkflowId {
  return journeySignals.scholarship.test(input) ? "scholarship" : "bereavement";
}

function findConflicts(input: string): ContributionConflict[] {
  const conflicts: ContributionConflict[] = [];

  if (/shyam\s+sundar/i.test(input)) {
    conflicts.push({
      field: "Name spelling",
      submitted: "Shyam Sundar",
      bundled: bundledName,
      reason: "The submitted name differs from the bundled bereavement seed.",
    });
  }

  if (/48\s*(?:hour|hrs|घंटे)/i.test(input)) {
    conflicts.push({
      field: "RTI timeline",
      submitted: "48 hours for an ordinary delay",
      bundled: "The 48-hour life-or-liberty period does not apply to ordinary delay",
      reason: "The bundled source marks this period as inapplicable to routine delay.",
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
  const matches = matchedNodes.map(
    (node) => `“${node.title}” is already part of the bundled ${workflow.subtitle} workflow.`,
  );

  const additions = additionSignals
    .filter(({ signal }) => signal.test(input))
    .map(({ note }) => note);

  const conflicts = findConflicts(input);

  // Contributors describing the same steps of the same journey corroborate each other.
  const claimKey = `${workflowId}:${matchedNodes.map((node) => node.id).sort().join(",")}`;
  const corroborationCount = recordCorroboration(claimKey);

  return {
    workflowId,
    title: `${workflow.subtitle} contribution`,
    steps: matchedNodes.length
      ? matchedNodes.map((node) => `${node.title} — ${node.detail}`)
      : workflow.nodes.slice(0, 2).map((node) => `${node.title} — ${node.detail}`),
    matches,
    additions,
    conflicts,
    sourceType: "lived experience",
    corroborationCount,
    status: resolveStatus(corroborationCount, conflicts.length),
  };
}
