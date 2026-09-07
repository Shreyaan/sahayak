import { correctServiceLink } from "./service-link-corrections";
import type { CaseSnapshot, WorkflowDefinition, WorkflowNode } from "./workflow";

export const unmatchedGuidance = {
  title: { en: "Review the answer you received", hi: "मिले हुए जवाब को समझें" },
  detail: {
    en: "Your response is saved. The earlier instructions are paused because this answer is outside this journey. Any date the desk gave you is recorded, not verified by Sahayak.",
    hi: "आपका जवाब सुरक्षित है। यह जवाब इस यात्रा के बाहर है, इसलिए पहले के निर्देश रोक दिए गए हैं। दफ़्तर की बताई तारीख दर्ज है; सहायक ने उसकी पुष्टि नहीं की है।",
  },
};

/** Only a saved, explicitly unmapped option pauses guidance; text is never classified here. */
export function unmatchedResponse(snapshot: CaseSnapshot, definition: WorkflowDefinition) {
  const report = snapshot.reports?.at(-1);
  if (!report) return;
  const option = definition.nodes.find(node => node.id === report.stepId)?.report?.options.find(option => option.id === report.optionId);
  const state = snapshot.nodes.find(node => node.id === report.stepId)?.state;
  if (option?.id === "different" && !option.outcome && (state === "needs-you" || state === "verifying" || state === "blocked")) return report;
}

/** Present saved guidance consistently without modifying the immutable workflow version. */
export function caseAction(snapshot: CaseSnapshot, definition: WorkflowDefinition): WorkflowNode | undefined {
  const unmatched = unmatchedResponse(snapshot, definition);
  const id = unmatched?.stepId ?? snapshot.nodes.find(node => node.state === "needs-you")?.id;
  const node = definition.nodes.find(node => node.id === id);
  if (!node) return;
  if (!unmatched) return correctServiceLink(node);
  return { ...node, title: unmatchedGuidance.title, detail: unmatchedGuidance.detail,
    ask: {en: "Would you like help understanding the recorded answer?", hi: "दर्ज जवाब समझने में मदद चाहिए?"},
    link: undefined, visit: undefined,
  };
}
