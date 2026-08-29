import { describe, expect, test } from "bun:test";
import { advanceCase, initialCase } from "./case";

describe("advanceCase", () => {
  test("confirms the synthetic name and opens the bank claim step", () => {
    const next = advanceCase(initialCase, "हाँ, नाम Shyam Sunder है");

    expect(next.nodes).toEqual([
      { id: "confirm-name", title: "नाम की पुष्टि", state: "done" },
      { id: "bank-claim", title: "बैंक क्लेम तैयार करें", state: "needs-you" },
    ]);
  });

  test("does not advance on an unrelated answer", () => {
    expect(advanceCase(initialCase, "मुझे समझ नहीं आया")).toEqual(initialCase);
  });
});
