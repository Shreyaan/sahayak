import type { CaseSnapshot, WorkflowDefinition, WorkflowNode } from "./workflow";

export const unmatchedGuidance = {
  title: { en: "Review the answer you received", hi: "मिले हुए जवाब को समझें" },
  detail: {
    en: "Your response is recorded. This journey does not cover that answer, so its earlier instructions are paused. Keep any date or next step the desk gave you with this record; Sahayak has not verified it. You can ask for help understanding the answer, or return when you have a new response to record. You do not need to repeat the previous visit just to continue here.",
    hi: "आपका जवाब दर्ज है। इस यात्रा में उस जवाब का रास्ता नहीं है, इसलिए पहले के निर्देश रोक दिए गए हैं। दफ़्तर ने जो तारीख या अगला कदम बताया, उसे इस रिकॉर्ड के साथ रखें; सहायक ने उसकी पुष्टि नहीं की है। जवाब समझने में मदद लें, या नया जवाब मिलने पर यहाँ दर्ज करें। यहाँ आगे बढ़ने के लिए पिछली मुलाकात दोहराना ज़रूरी नहीं है।",
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
  if (!node || !unmatched) return node;
  return { ...node, title: unmatchedGuidance.title, detail: unmatchedGuidance.detail,
    ask: {en: "Would you like help understanding the recorded answer?", hi: "दर्ज जवाब समझने में मदद चाहिए?"},
    link: undefined, visit: undefined,
  };
}
