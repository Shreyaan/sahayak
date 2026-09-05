import { describe, expect, test } from "bun:test";
import { jurisdictionSchema, revisionHash } from "./review-case";
import { workflows } from "./workflow";

describe("review case domain", () => {
  test("requires the location codes implied by the jurisdiction", () => {
    expect(jurisdictionSchema.safeParse({ scope: "central" }).success).toBe(true);
    expect(jurisdictionSchema.safeParse({ scope: "state", stateCode: "UP" }).success).toBe(true);
    expect(jurisdictionSchema.safeParse({ scope: "district", stateCode: "UP", districtCode: "LKO" }).success).toBe(true);
    expect(jurisdictionSchema.safeParse({ scope: "state" }).success).toBe(false);
    expect(jurisdictionSchema.safeParse({ scope: "district", stateCode: "UP" }).success).toBe(false);
    expect(jurisdictionSchema.safeParse({ scope: "central", stateCode: "UP" }).success).toBe(false);
    expect(jurisdictionSchema.safeParse({ scope: "state", stateCode: "UP", districtCode: "LKO" }).success).toBe(false);
  });

  test("hashes equivalent revision content deterministically regardless of object key order", () => {
    const first = {
      workflowId: "scholarship", definition: structuredClone(workflows.scholarship),
      title: { hi: "मसौदा", en: "Draft" },
      summary: { hi: "सार", en: "Summary" },
      steps: [{ hi: "पहला कदम", en: "First step" }],
      matches: [], additions: [], conflicts: [], sourceType: "lived experience" as const,
    };
    const reordered = {
      definition: structuredClone(workflows.scholarship), workflowId: "scholarship",
      sourceType: "lived experience" as const, conflicts: [], additions: [], matches: [],
      steps: [{ en: "First step", hi: "पहला कदम" }],
      summary: { en: "Summary", hi: "सार" }, title: { en: "Draft", hi: "मसौदा" },
    };

    expect(revisionHash(first)).toBe(revisionHash(reordered));
    expect(revisionHash(first)).toMatch(/^[a-f0-9]{64}$/);
  });
});
