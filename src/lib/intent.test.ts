import { describe, expect, test } from "bun:test";
import { readIntent } from "./intent";

describe("readIntent", () => {
  test.each(["हाँ", "haan, naam sahi hai", "yes", "ठीक है"])(
    "reads an affirmative reply: %s",
    (message) => {
      expect(readIntent(message)).toBe("affirmative");
    },
  );

  test.each([
    "नहीं",
    "नहीं, Shyam Sunder गलत है",
    "yes नहीं",
    "no, that name is wrong",
  ])("reads a negative reply even when an affirmative token appears: %s", (message) => {
    expect(readIntent(message)).toBe("negative");
  });

  test.each(["yesterday", "मुझे समझ नहीं आय"])(
    "does not treat an incidental substring as a confirmation: %s",
    (message) => {
      expect(readIntent(message)).not.toBe("affirmative");
    },
  );

  test("returns unknown for an unrelated reply", () => {
    expect(readIntent("कल बैंक गया था")).toBe("unknown");
  });
});
