import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";

const editableLocalizedSchema = z.object({
  en: z.string().max(2_000),
  hi: z.string().max(2_000),
}).strict().refine((value) => value.en.trim() || value.hi.trim(), "At least one translation is required.");

export const translatableWordingSchema = z.object({
  title: editableLocalizedSchema,
  subtitle: editableLocalizedSchema,
  nodes: z.array(z.object({
    id: z.string().trim().min(1).max(128),
    title: editableLocalizedSchema,
    detail: editableLocalizedSchema,
    ask: editableLocalizedSchema,
  }).strict()).min(1).max(20),
}).strict();

export type TranslatableWording = z.infer<typeof translatableWordingSchema>;

const translationOutputSchema = z.object({
  translations: z.array(z.object({
    key: z.string().min(1).max(256),
    target: z.enum(["en", "hi"]),
    text: z.string().trim().min(1).max(2_000),
  }).strict()).max(62),
}).strict();

type MissingTranslation = { key: string; source: Locale; target: Locale; text: string };
type Locale = "en" | "hi";

function missingTranslation(key: string, value: { en: string; hi: string }): MissingTranslation | undefined {
  const en = value.en.trim();
  const hi = value.hi.trim();
  if (!en && hi) return { key, source: "hi", target: "en", text: hi };
  if (en && !hi) return { key, source: "en", target: "hi", text: en };
  if (en.toLocaleLowerCase() !== hi.toLocaleLowerCase()) return undefined;
  return /\p{Script=Devanagari}/u.test(en)
    ? { key, source: "hi", target: "en", text: hi }
    : { key, source: "en", target: "hi", text: en };
}

export function hasMissingTranslation(wording: TranslatableWording): boolean {
  return collectMissing(wording).length > 0;
}

function collectMissing(wording: TranslatableWording): MissingTranslation[] {
  const missing: MissingTranslation[] = [];
  const title = missingTranslation("title", wording.title);
  const subtitle = missingTranslation("subtitle", wording.subtitle);
  if (title) missing.push(title);
  if (subtitle) missing.push(subtitle);
  for (const node of wording.nodes) {
    for (const field of ["title", "detail", "ask"] as const) {
      const item = missingTranslation(`nodes.${node.id}.${field}`, node[field]);
      if (item) missing.push(item);
    }
  }
  return missing;
}

export async function fillMissingTranslations(input: unknown): Promise<TranslatableWording> {
  const wording = translatableWordingSchema.parse(input);
  const missing = collectMissing(wording);
  if (missing.length === 0) return wording;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI_UNAVAILABLE");

  const openrouter = createOpenRouter({ apiKey });
  const result = await generateText({
    model: openrouter(process.env.AI_MODEL || "openai/gpt-5.6-luna"),
    output: Output.object({ schema: translationOutputSchema }),
    system: "Translate each supplied government-process UI string into its requested target language (Hindi or English). Preserve acronyms, proper nouns, quoted status labels, numbers, URLs, and factual meaning exactly. Use clear natural language. Do not add instructions, claims, deadlines, offices, documents, or policy. Return every supplied key and target exactly once.",
    prompt: JSON.stringify(missing),
    timeout: 30_000,
  });

  const translations = new Map(result.output.translations.map((item) => [`${item.key}:${item.target}`, item.text]));
  if (translations.size !== missing.length || missing.some((item) => !translations.has(`${item.key}:${item.target}`))) {
    throw new Error("AI_INVALID_RESPONSE");
  }

  const translated = structuredClone(wording);
  for (const item of missing) {
    const value = translations.get(`${item.key}:${item.target}`)!;
    if (item.key === "title") translated.title[item.target] = value;
    else if (item.key === "subtitle") translated.subtitle[item.target] = value;
    else {
      const [, nodeId, field] = item.key.split(".") as [string, string, "title" | "detail" | "ask"];
      const node = translated.nodes.find((candidate) => candidate.id === nodeId)!;
      node[field][item.target] = value;
    }
  }
  return translated;
}
