import { advanceCase, type CaseSnapshot } from "./case";

export function replyToCitizen(
  caseSnapshot: CaseSnapshot,
  message: string,
): { reply: string; caseSnapshot: CaseSnapshot } {
  const nextCase = advanceCase(caseSnapshot, message);

  if (nextCase === caseSnapshot) {
    return {
      reply: "Form 4 में नाम Shyam Sunder मिला है। क्या यह सही है?",
      caseSnapshot,
    };
  }

  return {
    reply: "ठीक है। अब बैंक क्लेम तैयार करते हैं। मैं जरूरी कागज़ों की सूची दिखा रहा हूँ।",
    caseSnapshot: nextCase,
  };
}
