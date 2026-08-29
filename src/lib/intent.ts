export type Intent = "affirmative" | "negative" | "unknown";

const negative = /\b(?:no|not|nope|nah|wrong|incorrect)\b|नहीं|नही|गलत/i;
const affirmative = /\b(?:haan|haa|yes|yep|correct|right|ok|okay|theek|sahi)\b|हाँ|हां|सही|ठीक/i;

/**
 * Reads a citizen reply as a confirmation signal. Negation always wins, so
 * "नहीं, यह सही नहीं है" and "yes नहीं" never read as a confirmation.
 */
export function readIntent(message: string): Intent {
  if (negative.test(message)) return "negative";
  if (affirmative.test(message)) return "affirmative";
  return "unknown";
}
