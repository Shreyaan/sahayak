import type { CaseSnapshot, WorkflowDefinition } from "./workflow";
import type { Locale, Localized } from "./locale";
import type { TrustMetadata } from "./trust";

/** One bilingual copy for sharing, downloading and printing, from the exact saved version. */
export function buildActionBrief(
  snapshot: CaseSnapshot,
  definition: WorkflowDefinition,
  trust: TrustMetadata,
  locale: Locale
): string {
  const pair = (value: Localized) => locale === "hi" ? `${value.hi}\n${value.en}` : `${value.en}\n${value.hi}`;
  const node = definition.nodes.find(node => node.id === snapshot.nodes.find(node => node.state === "needs-you")?.id);
  const latest = snapshot.reports?.at(-1);
  const lines = [
    "SAHAYAK · TAKE THIS WITH YOU / इसे साथ रखें",
    "Independent prototype. This is preparation, not a government submission or approval.",
    "स्वतंत्र प्रोटोटाइप। यह तैयारी है, सरकारी आवेदन या मंजूरी नहीं।",
    "", "My problem / मेरी समस्या", pair(definition.title),
    "", `Workflow version / यात्रा संस्करण: ${snapshot.workflowVersionId}`,
    "", "Next action / अगला कदम",
  ];
  if (node) {
    lines.push(pair(node.title));
    if (node.link) lines.push("", pair(node.link.action), node.link.url, pair(node.detail), pair(node.link.collect));
    if (node.visit) {
      lines.push("", "Where to ask / कहाँ पूछें", pair(node.visit.office), pair(node.visit.why),
        "", "Keep ready / तैयार रखें", ...node.visit.carry.map(item => `□ ${pair(item)}`),
        "", "What to say / क्या कहें", pair(node.visit.script),
        "", "What to collect / क्या प्रमाण लें", pair(node.visit.collect),
        "", "What to expect / क्या अपेक्षा रखें", pair(node.visit.expect));
    } else lines.push(pair(node.detail), pair(node.ask));
  } else lines.push("No action is open. Your case record does not by itself confirm resolution.", "अभी कोई कदम खुला नहीं है। केस रिकॉर्ड से समस्या हल होने की पुष्टि नहीं होती।");
  if (latest) lines.push("", "Last response you recorded / आपका आखिरी दर्ज जवाब", latest.response,
    `Response date / जवाब की तारीख: ${latest.responseDate}`,
    `Reference / संदर्भ: ${latest.referenceNumber || "Not provided / नहीं मिला"}`,
    `Recorded at / दर्ज किया: ${latest.recordedAt}`,
    ...(latest.evidence ? [`Evidence note / प्रमाण का नोट: ${latest.evidence}`] : []));
  const references = snapshot.reports?.filter(report => report.referenceNumber && report !== latest) ?? [];
  if (references.length) lines.push("", "Earlier references / पिछले संदर्भ", ...references.map(report => `${report.responseDate}: ${report.referenceNumber}`));
  lines.push("", "After your visit or check / मिलने या जाँचने के बाद",
    "Exact response / मिला जवाब: ____________________",
    "Response date / तारीख: __________ Reference / संदर्भ: __________",
    "Evidence kept with you / अपने पास रखा प्रमाण: ____________________",
    "Return in the same browser to record it. A case link does not grant another browser access.",
    "इसे दर्ज करने के लिए इसी ब्राउज़र में लौटें। केस लिंक से दूसरे ब्राउज़र को पहुँच नहीं मिलती।",
    "", "Guidance sources — expert verification is shown in the app / स्रोत — विशेषज्ञ सत्यापन ऐप में देखें",
    ...trust.sourceLinks.map(source => `${source.label}: ${source.url}`));
  return lines.join("\n");
}
