import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { Locale } from "./locale";
import type { ArtifactDraft } from "./artifact-drafts";

const labels = {
  en: {
    title: "Scholarship grievance",
    synthetic: "Synthetic example record",
    draft: "Draft only. Sahayak has not submitted this document.",
    applicant: "Applicant name",
    application: "Scholarship application ID",
    contact: "Registered contact",
    account: "Bank account last 4 digits",
    recipient: "To",
    subject: "Subject",
    request: "Requested action",
    enclosures: "Enclosures or evidence notes",
    signature: "Signature",
    date: "Date",
  },
  hi: {
    title: "छात्रवृत्ति शिकायत",
    synthetic: "कृत्रिम उदाहरण रिकॉर्ड",
    draft: "केवल मसौदा। सहायक ने यह दस्तावेज़ जमा नहीं किया है।",
    applicant: "आवेदक का नाम",
    application: "छात्रवृत्ति आवेदन आईडी",
    contact: "पंजीकृत संपर्क",
    account: "बैंक खाते के अंतिम 4 अंक",
    recipient: "सेवा में",
    subject: "विषय",
    request: "अनुरोधित कार्रवाई",
    enclosures: "संलग्नक या प्रमाण नोट",
    signature: "हस्ताक्षर",
    date: "दिनांक",
  },
} as const;

function field(label: string, value: string) {
  return new Paragraph({
    spacing: { after: 140 },
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value || "____________________")],
  });
}

export async function buildArtifactDocument(draft: ArtifactDraft, locale: Locale, synthetic: boolean): Promise<ArrayBuffer> {
  const copy = labels[locale];
  const content = draft.document[locale];
  const fields = draft.fields;
  const children = [
    new Paragraph({ text: copy.title, heading: HeadingLevel.TITLE, spacing: { after: 220 } }),
    ...(synthetic ? [new Paragraph({ children: [new TextRun({ text: copy.synthetic, bold: true })], spacing: { after: 120 } })] : []),
    new Paragraph({ children: [new TextRun({ text: copy.draft, bold: true })], spacing: { after: 260 } }),
    field(copy.applicant, fields.applicantName),
    field(copy.application, fields.applicationId),
    field(copy.contact, fields.contact),
    field(copy.account, fields.bankAccountLastFour),
    new Paragraph({ text: "", spacing: { after: 80 } }),
    field(copy.recipient, content.recipient),
    field(copy.subject, content.subject),
    new Paragraph({ text: content.body, spacing: { before: 160, after: 220 }, alignment: AlignmentType.JUSTIFIED }),
    field(copy.request, content.request),
    field(copy.enclosures, content.enclosures),
    new Paragraph({ text: "", spacing: { after: 220 } }),
    field(copy.signature, ""),
    field(copy.date, ""),
  ];

  const document = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [{ id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { color: "000000", bold: true, size: 34, font: "Arial" }, paragraph: { spacing: { after: 220 } } }],
    },
    sections: [{ properties: {}, children }],
  });
  const buffer = await Packer.toBuffer(document);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export async function buildTemplateArtifactDocument(
  title: string,
  lines: string[],
  locale: Locale,
  synthetic: boolean,
): Promise<ArrayBuffer> {
  const copy = labels[locale];
  const document = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 22 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [{ id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { color: "000000", bold: true, size: 34, font: "Arial" }, paragraph: { spacing: { after: 220 } } }],
    },
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.TITLE, spacing: { after: 220 } }),
        ...(synthetic ? [new Paragraph({ children: [new TextRun({ text: copy.synthetic, bold: true })], spacing: { after: 120 } })] : []),
        new Paragraph({ children: [new TextRun({ text: copy.draft, bold: true })], spacing: { after: 260 } }),
        ...lines.map((line) => new Paragraph({ text: line, spacing: { after: 160 } })),
      ],
    }],
  });
  const buffer = await Packer.toBuffer(document);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
