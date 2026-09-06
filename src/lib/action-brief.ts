import type { CaseSnapshot, WorkflowDefinition } from './workflow';
import type { Locale } from './locale';
import type { TrustMetadata } from './trust';

/** Portable deterministic preparation, taken from the case's exact stored version. */
export function buildActionBrief(snapshot: CaseSnapshot, definition: WorkflowDefinition, trust: TrustMetadata, locale: Locale): string {
  const t = (en: string, hi: string) => locale === 'hi' ? hi : en;
  const open = snapshot.nodes.find(node => node.state === 'needs-you');
  const node = definition.nodes.find(node => node.id === open?.id);
  const lines = [
    `Sahayak — ${definition.title[locale]}`,
    t('Independent prototype. This is preparation, not a government submission or approval.', 'स्वतंत्र प्रोटोटाइप। यह तैयारी है, सरकारी आवेदन या मंजूरी नहीं।'),
    `${t('Workflow version', 'यात्रा संस्करण')}: ${snapshot.workflowVersionId}`,
    '',
  ];
  if (node) {
    lines.push(`${t('Next action', 'अगला कदम')}: ${node.title[locale]}`, node.detail[locale], node.ask[locale], '');
    if (node.link) lines.push(node.link.action[locale], node.link.url, node.link.collect[locale], '');
    if (node.visit) lines.push(
      `${t('Where to ask', 'कहाँ पूछें')}: ${node.visit.office[locale]}`, node.visit.why[locale],
      t('Keep ready', 'तैयार रखें'), ...node.visit.carry.map(item => `□ ${item[locale]}`),
      `${t('What to say', 'क्या कहें')}: ${node.visit.script[locale]}`,
      `${t('What to expect', 'क्या अपेक्षा रखें')}: ${node.visit.expect[locale]}`,
      `${t('What to collect', 'क्या प्रमाण लें')}: ${node.visit.collect[locale]}`, '',
    );
  } else lines.push(t('No action is currently open. Keep the Case Card for your history and outcome evidence.', 'अभी कोई कदम खुला नहीं है। इतिहास और नतीजे के प्रमाण के लिए Case Card रखें।'));
  const references = snapshot.reports?.filter(report => report.referenceNumber) ?? [];
  if (references.length) lines.push(t('Your recorded references', 'आपके दर्ज संदर्भ'), ...references.map(report => `${report.responseDate}: ${report.referenceNumber}`), '');
  lines.push(t('When you return', 'लौटते समय'),
    t('Write the exact response: ____________________', 'मिला सही जवाब लिखें: ____________________'),
    t('Response date: __________ Reference: __________', 'जवाब की तारीख: __________ संदर्भ: __________'),
    t('Evidence kept with you: ____________________', 'अपने पास रखा प्रमाण: ____________________'),
    t('Return in the same browser to record it. A case link does not grant another browser access.', 'इसे दर्ज करने के लिए इसी ब्राउज़र में लौटें। केस लिंक से दूसरे ब्राउज़र को पहुँच नहीं मिलती।'),
    '', t('Guidance sources — expert verification is shown in the app', 'मार्गदर्शन के स्रोत — विशेषज्ञ सत्यापन ऐप में देखें'),
    ...trust.sourceLinks.map(source => `${source.label}: ${source.url}`),
  );
  return lines.join('\n');
}
