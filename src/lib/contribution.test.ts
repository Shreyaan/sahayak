import { describe, expect, test } from "bun:test";
import { compileContribution } from "./contribution";

describe("compileContribution", () => {
  test("creates a draft lived-experience contribution from bereavement input", () => {
    const draft = compileContribution(
      "After my father died, I took Form 4 to the bank and submitted a claim.",
    );

    expect(draft.sourceType).toBe("lived experience");
    expect(draft.corroborationCount).toBe(1);
    expect(draft.status).toBe("draft");
    expect(draft.steps.length).toBeGreaterThan(0);
  });

  test("flags a submitted Shyam Sundar spelling against the bundled seed", () => {
    const draft = compileContribution("The Form 4 listed Shyam Sundar as the claimant.");

    expect(draft.conflicts).toContainEqual(
      expect.objectContaining({
        field: "Name spelling",
        submitted: "Shyam Sundar",
        bundled: "Shyam Sunder",
      }),
    );
  });
});
