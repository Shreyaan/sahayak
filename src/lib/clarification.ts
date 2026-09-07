import { z } from "zod";

/** A citizen-kept question, never a desk response or published instruction. */
export const clarificationNoteSchema = z.object({
  reportRecordedAt: z.iso.datetime(),
  text: z.string().trim().min(1).max(1500),
  savedAt: z.iso.datetime(),
}).strict();
export type ClarificationNote = z.infer<typeof clarificationNoteSchema>;

export const clarificationSchema = z.object({
  explanation: z.string().trim().min(1).max(700),
  question: z.string().trim().min(1).max(300).nullable(),
  nextQuestion: z.string().trim().min(1).max(700),
  supportedOptionId: z.string().nullable(),
}).strict();
export type Clarification = z.infer<typeof clarificationSchema>;
