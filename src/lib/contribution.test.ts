import { beforeEach, describe, expect, test } from "bun:test";
import { compileContribution } from "./contribution";
import { resetCorroboration } from "./corroboration";
import { t, type Locale, type Localized } from "./locale";

beforeEach(resetCorroboration);

/** Joins a localized list into one string so a test can search it. */
function read(values: Localized[], locale: Locale): string {
  return values.map((value) => t(value, locale)).join(" ");
}

describe("compileContribution", () => {
  test("creates a draft lived-experience contribution from bereavement input", () => {
    const draft = compileContribution(
      "After my father died, I took Form 4 to the bank and submitted a claim.",
    );

    expect(draft.workflowId).toBe("bereavement");
    expect(draft.sourceType).toBe("lived experience");
    expect(draft.corroborationCount).toBe(1);
    expect(draft.status).toBe("draft");
    expect(draft.steps.length).toBeGreaterThan(0);
  });

  test("writes every user-facing string in both languages", () => {
    const draft = compileContribution("The Form 4 listed Shyam Sundar as the claimant.");

    expect(draft.title.hi).toContain("योगदान");
    expect(draft.title.en).toBe("Bereavement claim contribution");
    expect(read(draft.steps, "hi")).not.toContain("[object Object]");
    expect(read(draft.steps, "en")).not.toContain("[object Object]");
    expect(read(draft.matches, "hi")).not.toContain("[object Object]");
    expect(read(draft.matches, "en")).toContain("is already part of the bundled");
  });

  test("routes a scholarship experience to the scholarship seed", () => {
    const draft = compileContribution(
      "NSP showed Released to PFMS but the money never arrived; the bank said NPCI seeding was missing.",
    );

    expect(draft.workflowId).toBe("scholarship");
    expect(read(draft.matches, "hi")).toContain("बैंक खाता सीडिंग");
    expect(read(draft.matches, "en")).toContain("Fix the bank account seeding");
  });

  test("flags a submitted Shyam Sundar spelling against the bundled seed", () => {
    const draft = compileContribution("The Form 4 listed Shyam Sundar as the claimant.");

    expect(draft.conflicts).toContainEqual(
      expect.objectContaining({
        field: { hi: "नाम की वर्तनी", en: "Name spelling" },
        submitted: { hi: "Shyam Sundar", en: "Shyam Sundar" },
        bundled: { hi: "Shyam Sunder", en: "Shyam Sunder" },
      }),
    );
  });

  test("flags a contributed RTI deadline that contradicts the bundled source", () => {
    const draft = compileContribution(
      "For a delayed EPFO claim you can file an RTI and they must reply within 48 hours.",
    );

    expect(draft.conflicts.map((conflict) => conflict.field.en)).toContain("RTI timeline");
    expect(draft.conflicts.map((conflict) => conflict.field.hi)).toContain("RTI समय-सीमा");
    expect(draft.status).toBe("needs review");
  });

  test("reports an unofficial payment as an addition needing review, not as guidance", () => {
    const draft = compileContribution(
      "At the office an agent asked for a ₹500 fee to move the death claim forward.",
    );

    expect(read(draft.additions, "en")).toContain("payment");
    expect(read(draft.additions, "en")).toContain("middleman");
    expect(read(draft.additions, "hi")).toContain("भुगतान");
    expect(read(draft.additions, "hi")).toContain("बिचौलिया");
  });

  test("a second matching contribution corroborates the first and becomes publishable", () => {
    const first = compileContribution("I used Form 4 for the bank claim after the death.");
    const second = compileContribution("Form 4 was needed for my bank claim after a death too.");

    expect(first.corroborationCount).toBe(1);
    expect(first.status).toBe("draft");
    expect(second.corroborationCount).toBe(2);
    expect(second.status).toBe("publishable draft");
  });

  test("corroboration never publishes a draft that still holds a conflict", () => {
    const input = "Form 4 listed Shyam Sundar for the bank claim after the death.";

    compileContribution(input);
    const second = compileContribution(input);

    expect(second.corroborationCount).toBe(2);
    expect(second.status).toBe("needs review");
    expect(second.conflicts.length).toBeGreaterThan(0);
  });
});
