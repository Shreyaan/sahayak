import type { CaseSnapshot, WorkflowDefinition } from "./workflow";

/** Explain only a configured recovery that is still the citizen's active action. */
export function recoveryContext(snapshot: CaseSnapshot, definition: WorkflowDefinition) {
  const current = snapshot.nodes.find(node => node.state === "needs-you");
  if (!current) return;
  for (const report of [...(snapshot.reports ?? [])].reverse()) {
    const source = definition.nodes.find(node => node.id === report.stepId);
    const option = source?.report?.options.find(option => option.id === report.optionId);
    if (option?.outcome?.state === "blocked" && option.outcome.opens === current.id &&
      snapshot.nodes.some(node => node.id === report.stepId && node.state === "blocked")) {
      return { report, option };
    }
  }
}
