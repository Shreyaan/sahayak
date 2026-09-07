import { caseAction } from "./response-guidance";
import type { CaseSnapshot, WorkflowDefinition } from "./workflow";
import type { Locale, Localized } from "./locale";
import type { TrustMetadata } from "./trust";

/** A brief in the selected UI language; citizen evidence stays verbatim. */
export function buildActionBrief(
  snapshot: CaseSnapshot,
  definition: WorkflowDefinition,
  trust: TrustMetadata,
  locale: Locale
): string {
  const local = (value: Localized) => value[locale];
  const label = (en: string, hi: string) => (locale === "hi" ? hi : en);
  const node = caseAction(snapshot, definition);
  const latest = snapshot.reports?.at(-1);
  const lines = [
    label("SAHAYAK · TAKE THIS WITH YOU", "सहायक · इसे साथ रखें"),
    "",
    label("My problem", "मेरी समस्या"),
    local(definition.title),
    "",
    label("Next action", "अगला कदम"),
  ];
  if (node) {
    lines.push(local(node.title));
    if (node.link)
      lines.push(
        "",
        local(node.link.action),
        node.link.url,
        local(node.detail),
        local(node.link.collect)
      );
    if (node.visit) {
      lines.push(
        "",
        label("Where to ask", "कहाँ पूछें"),
        local(node.visit.office),
        local(node.visit.why),
        "",
        label("Keep ready", "तैयार रखें"),
        ...node.visit.carry.map((item) => `□ ${local(item)}`),
        "",
        label("What to say", "क्या कहें"),
        local(node.visit.script),
        "",
        label("What to collect", "क्या प्रमाण लें"),
        local(node.visit.collect),
        "",
        label("What to expect", "क्या अपेक्षा रखें"),
        local(node.visit.expect)
      );
    } else lines.push(local(node.detail), local(node.ask));
  } else
    lines.push(
      label(
        "No action is open. Your case record does not by itself confirm resolution.",
        "अभी कोई कदम खुला नहीं है। केस रिकॉर्ड से समस्या हल होने की पुष्टि नहीं होती।"
      )
    );
  if (latest)
    lines.push(
      "",
      label("Last response you recorded", "आपका आखिरी दर्ज जवाब"),
      latest.response,
      `${label("Response date", "जवाब की तारीख")}: ${latest.responseDate}`,
      `${label("Reference", "संदर्भ")}: ${latest.referenceNumber || label("Not provided", "नहीं मिला")}`,
      `${label("Recorded at", "दर्ज किया")}: ${latest.recordedAt}`,
      ...(latest.evidence
        ? [`${label("Evidence note", "प्रमाण का नोट")}: ${latest.evidence}`]
        : [])
    );
  if (snapshot.clarificationNotes?.length) lines.push("", label("Questions you kept — not official guidance", "आपके रखे सवाल — आधिकारिक निर्देश नहीं"),
    ...snapshot.clarificationNotes.flatMap(note => [note.text, `${label("Saved at", "सुरक्षित किया")}: ${note.savedAt}`]));
  const references =
    snapshot.reports?.filter(
      (report) => report.referenceNumber && report !== latest
    ) ?? [];
  if (references.length)
    lines.push(
      "",
      label("Earlier references", "पिछले संदर्भ"),
      ...references.map(
        (report) => `${report.responseDate}: ${report.referenceNumber}`
      )
    );
  lines.push(
    "",
    label("After your visit or check", "मिलने या जाँचने के बाद"),
    `${label("Exact response", "मिला जवाब")}: ____________________`,
    `${label("Response date", "तारीख")}: __________ ${label("Reference", "संदर्भ")}: __________`,
    `${label("Evidence kept with you", "अपने पास रखा प्रमाण")}: ____________________`,
    label(
      "Return in the same browser to record it. A case link does not grant another browser access.",
      "इसे दर्ज करने के लिए इसी ब्राउज़र में लौटें। केस लिंक से दूसरे ब्राउज़र को पहुँच नहीं मिलती।"
    ),
    "",
    label(
      "Guidance sources — expert verification is shown in the app",
      "स्रोत — विशेषज्ञ सत्यापन ऐप में देखें"
    ),
    ...trust.sourceLinks.map((source) => `${source.label}: ${source.url}`)
  );
  return lines.join("\n");
}
