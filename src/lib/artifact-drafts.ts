import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { DeskReport } from "./workflow";
import type { Localized } from "./locale";

export const scholarshipGrievanceFieldsSchema = z.object({
  applicantName: z.string().trim().min(1).max(120),
  applicationId: z.string().trim().min(1).max(120),
  contact: z.string().trim().max(160),
  bankAccountLastFour: z.string().trim().regex(/^\d{0,4}$/, "Use only the last four digits."),
  destination: z.string().trim().min(1).max(200),
}).strict();

const documentSectionSchema = z.object({
  recipient: z.string().trim().min(1).max(300),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(4_000),
  request: z.string().trim().min(1).max(1_000),
  enclosures: z.string().trim().max(1_000),
}).strict();

export const generatedGrievanceSchema = z.object({
  en: documentSectionSchema,
  hi: documentSectionSchema,
}).strict();

export const artifactDraftSchema = z.object({
  schemaVersion: z.literal("scholarship-grievance-v1"),
  artifactId: z.literal("escalation-draft"),
  fields: scholarshipGrievanceFieldsSchema,
  document: generatedGrievanceSchema,
  generatedAt: z.string().datetime(),
  model: z.string().trim().min(1).max(200),
}).strict();

export type ScholarshipGrievanceFields = z.infer<typeof scholarshipGrievanceFieldsSchema>;
export type ArtifactDraft = z.infer<typeof artifactDraftSchema>;

type InputDefinition = {
  id: keyof ScholarshipGrievanceFields;
  label: Localized;
  hint: Localized;
  required: boolean;
};

/** Reviewed fields stay stable even though the clerk writes the document. */
export const artifactInputDefinitions: Record<"escalation-draft", InputDefinition[]> = {
  "escalation-draft": [
    { id: "applicantName", required: true, label: { en: "Applicant name", hi: "आवेदक का नाम" }, hint: { en: "As shown on the scholarship application", hi: "जैसा छात्रवृत्ति आवेदन में दर्ज है" } },
    { id: "applicationId", required: true, label: { en: "Scholarship application ID", hi: "छात्रवृत्ति आवेदन आईडी" }, hint: { en: "Enter the exact application or registration number", hi: "सही आवेदन या पंजीकरण संख्या दर्ज करें" } },
    { id: "contact", required: false, label: { en: "Registered mobile or email", hi: "पंजीकृत मोबाइल या ईमेल" }, hint: { en: "Optional", hi: "वैकल्पिक" } },
    { id: "bankAccountLastFour", required: false, label: { en: "Bank account last 4 digits", hi: "बैंक खाते के अंतिम 4 अंक" }, hint: { en: "Optional; never enter the full account number", hi: "वैकल्पिक; पूरा खाता नंबर कभी दर्ज न करें" } },
    { id: "destination", required: true, label: { en: "Send this grievance to", hi: "यह शिकायत कहाँ भेजनी है" }, hint: { en: "Enter the portal, office, or officer shown in your records", hi: "अपने रिकॉर्ड में दिख रहा पोर्टल, कार्यालय या अधिकारी दर्ज करें" } },
  ],
};

export function buildArtifactPrompt({ fields, reports }: { fields: ScholarshipGrievanceFields; reports: DeskReport[] }): string {
  return JSON.stringify({
    task: "Write one editable scholarship grievance in clear, respectful Hindi and English.",
    citizenFields: fields,
    citizenRecordedEvents: reports.map(({ recordedAt: _recordedAt, synthetic: _synthetic, ...report }) => report),
    rules: [
      "Use only the citizen fields and recorded events supplied here.",
      "Do not invent an office, URL, rule, deadline, document, response, reference number, submission, or outcome.",
      "Do not claim that Sahayak contacted anyone, submitted anything, or verified the citizen's account.",
      "State that this is a draft prepared for the citizen to review and is not submitted.",
      "Keep Hindi and English semantically equivalent.",
      "Ask for a written response and reference number without promising resolution.",
      "If no enclosures were recorded, leave enclosures empty.",
    ],
  });
}

export async function generateScholarshipGrievance(
  fieldsInput: unknown,
  reports: DeskReport[],
): Promise<ArtifactDraft> {
  const fields = scholarshipGrievanceFieldsSchema.parse(fieldsInput);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI_UNAVAILABLE");

  const model = process.env.AI_MODEL || "openai/gpt-5.6-luna";
  const openrouter = createOpenRouter({ apiKey });
  const result = await generateText({
    model: openrouter(model),
    output: Output.object({ schema: generatedGrievanceSchema }),
    system: "You are Sahayak's drafting clerk. Produce a practical grievance from only the supplied structured facts. Never add facts or imply submission, verification, official affiliation, or a government response. Return the requested bilingual structure only.",
    prompt: buildArtifactPrompt({ fields, reports }),
    timeout: 30_000,
  });

  return artifactDraftSchema.parse({
    schemaVersion: "scholarship-grievance-v1",
    artifactId: "escalation-draft",
    fields,
    document: result.output,
    generatedAt: new Date().toISOString(),
    model,
  });
}
