import type { CaseSnapshot, NodeState } from "./workflow";

export type CitizenOutcomeKind = "awareness" | "worked" | "different" | "stuck" | "skipped" | "resolved";
export type CitizenOutcome = {
  id: string;
  caseId: string;
  workflowVersionId: string;
  stepId: string | null;
  kind: CitizenOutcomeKind;
  detail: string | null;
  scope: "central" | "state" | "district";
  stateCode: string | null;
  districtCode: string | null;
  occurredAt: string;
};
export type CitizenOutcomeMetrics = {
  awareCases: number;
  resolvedCases: number;
  evidencedResolvedCases: number;
};

type CaseRecord = {
  id: string;
  snapshot: CaseSnapshot;
};

type VersionJurisdiction = {
  scope: CitizenOutcome["scope"];
  stateCode: string | null;
  districtCode: string | null;
};

export type CitizenOutcomeRepository = {
  getCase(caseId: string, ownerHash?: string): Promise<CaseRecord | null>;
  getWorkflowVersion(workflowVersionId: string): Promise<VersionJurisdiction | null>;
  createCaseWithOutcome(
    record: { id: string; snapshot: CaseSnapshot; ownerHash: string },
    event: CitizenOutcome,
  ): Promise<void>;
  appendOutcome(event: CitizenOutcome): Promise<void>;
  listOutcomes(caseId: string): Promise<CitizenOutcome[]>;
  summarizeOutcomes(): Promise<CitizenOutcomeMetrics>;
};

export type RecordCitizenOutcome =
  | { kind: "awareness" }
  | { kind: "worked" | "different" | "stuck" | "skipped"; stepId: string; detail?: string }
  | { kind: "resolved"; detail?: string };

const reportableStates = new Set<NodeState>(["done", "blocked", "needs-you", "verifying"]);

export function redactCitizenText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[pan]")
    .replace(/(?<![\d०-९])(?:\+?(?:91|९१)[\s-]?)?[6-9६-९](?:[\s-]?[\d०-९]){9}(?![\d०-९])/g, "[phone]")
    .replace(/(?<![\d०-९])(?:[\d०-९][\s-]?){8,17}[\d०-९](?![\d०-९])/g, (number) => {
      const digits = number.match(/[\d०-९]/g)?.length ?? 0;
      return digits === 12 ? "[id]" : "[account]";
    })
    .trim();
}

export function createCitizenOutcomeService(
  repository: CitizenOutcomeRepository,
  now: () => Date = () => new Date(),
) {
  return {
    async start(caseId: string, snapshot: CaseSnapshot, ownerHash: string) {
      const jurisdiction = await repository.getWorkflowVersion(snapshot.workflowVersionId);
      if (!jurisdiction) throw new Error("WORKFLOW_VERSION_NOT_FOUND");
      const event: CitizenOutcome = {
        id: crypto.randomUUID(),
        caseId,
        workflowVersionId: snapshot.workflowVersionId,
        stepId: null,
        kind: "awareness",
        detail: null,
        ...jurisdiction,
        occurredAt: now().toISOString(),
      };
      await repository.createCaseWithOutcome({ id: caseId, snapshot, ownerHash }, event);
      return event;
    },

    async record(caseId: string, input: RecordCitizenOutcome, ownerHash?: string) {
      const record = await repository.getCase(caseId, ownerHash);
      if (!record) throw new Error("CASE_NOT_FOUND");

      const versionId = record.snapshot.workflowVersionId;
      const jurisdiction = await repository.getWorkflowVersion(versionId);
      if (!jurisdiction) throw new Error("WORKFLOW_VERSION_NOT_FOUND");

      let stepId: string | null = null;
      if (input.kind !== "awareness" && input.kind !== "resolved") {
        const step = record.snapshot.nodes.find(({ id }) => id === input.stepId);
        if (!step || !reportableStates.has(step.state) || (input.kind === "worked" && step.state !== "done")) throw new Error("STEP_NOT_REPORTABLE");
        stepId = step.id;
      }

      if (input.kind === "resolved") {
        const completed = record.snapshot.nodes.some(({ id, state }) => id === "case-done" && state === "done");
        if (!completed) throw new Error("CASE_NOT_RESOLVED");
      }

      const rawDetail = "detail" in input ? input.detail?.trim() : undefined;
      const event: CitizenOutcome = {
        id: crypto.randomUUID(),
        caseId,
        workflowVersionId: versionId,
        stepId,
        kind: input.kind,
        detail: rawDetail ? redactCitizenText(rawDetail) : null,
        ...jurisdiction,
        occurredAt: now().toISOString(),
      };
      await repository.appendOutcome(event);
      return event;
    },

    async list(caseId: string, ownerHash?: string) {
      const record = await repository.getCase(caseId, ownerHash);
      if (!record) throw new Error("CASE_NOT_FOUND");
      return repository.listOutcomes(caseId);
    },

    metrics() {
      return repository.summarizeOutcomes();
    },
  };
}

export function summarizeCitizenOutcomes(events: Array<Pick<CitizenOutcome, "caseId" | "kind"> & { detail?: string | null }>): CitizenOutcomeMetrics {
  const aware = new Set<string>();
  const resolved = new Set<string>();
  const evidenced = new Set<string>();

  for (const event of events) {
    if (event.kind === "awareness") aware.add(event.caseId);
    if (event.kind === "resolved") {
      resolved.add(event.caseId);
      if (event.detail?.trim()) evidenced.add(event.caseId);
    }
  }

  return {
    awareCases: aware.size,
    resolvedCases: resolved.size,
    evidencedResolvedCases: evidenced.size,
  };
}
