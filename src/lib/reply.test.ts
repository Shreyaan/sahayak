import { describe, expect, test } from "bun:test";
import { initialCase } from "./case";
import { replyToCitizen } from "./reply";

describe("replyToCitizen", () => {
  test("asks the citizen to confirm the extracted synthetic name", () => {
    const result = replyToCitizen(initialCase, "नमस्ते");

    expect(result.reply).toContain("Shyam Sunder");
    expect(result.caseSnapshot).toEqual(initialCase);
  });

  test("reports the next action after confirmation", () => {
    const result = replyToCitizen(initialCase, "हाँ, सही है");

    expect(result.reply).toContain("बैंक क्लेम");
    expect(result.caseSnapshot.nodes[1]?.state).toBe("needs-you");
  });

  test("keeps describing the bank claim action after the case has advanced", () => {
    const advancedCase = replyToCitizen(initialCase, "हाँ").caseSnapshot;

    const result = replyToCitizen(advancedCase, "अगला कदम क्या है?");

    expect(result.reply).toContain("बैंक क्लेम");
    expect(result.reply).not.toContain("क्या यह सही है");
    expect(result.caseSnapshot).toEqual(advancedCase);
  });
});
