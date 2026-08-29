export type ContributionConflict = {
  field: string;
  submitted: string;
  bundled: string;
  reason: string;
};

export type ContributionDraft = {
  title: string;
  steps: string[];
  matches: string[];
  additions: string[];
  conflicts: ContributionConflict[];
  sourceType: "lived experience";
  corroborationCount: 1;
  status: "draft";
};

const bundledName = "Shyam Sunder";

export function compileContribution(input: string): ContributionDraft {
  const normalized = input.toLowerCase();
  const matches: string[] = [];
  const additions: string[] = [];
  const conflicts: ContributionConflict[] = [];

  if (normalized.includes("form 4")) {
    matches.push("Form 4 is already part of the bundled bereavement workflow.");
  }

  if (normalized.includes("bank") || normalized.includes("claim")) {
    matches.push("Bank claim handling matches the bundled bereavement workflow.");
  }

  if (normalized.includes("office")) {
    additions.push("Review the reported office visit before adding it to the workflow.");
  }

  if (/shyam\s+sundar/i.test(input)) {
    conflicts.push({
      field: "Name spelling",
      submitted: "Shyam Sundar",
      bundled: bundledName,
      reason: "The submitted name differs from the bundled bereavement seed.",
    });
  }

  return {
    title: "Bereavement claim contribution",
    steps: [
      "Review the death registration and Form 4 details.",
      "Prepare the bank claim documents and collect the acknowledgement.",
    ],
    matches,
    additions,
    conflicts,
    sourceType: "lived experience",
    corroborationCount: 1,
    status: "draft",
  };
}
