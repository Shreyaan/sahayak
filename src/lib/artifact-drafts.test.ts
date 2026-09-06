import { describe, expect, test } from "bun:test";
import {
  artifactDraftSchema,
  artifactInputDefinitions,
  buildArtifactPrompt,
} from "./artifact-drafts";

describe("AI artifact drafting boundary", () => {
  test("the grievance uses a fixed citizen input schema", () => {
    expect(artifactInputDefinitions["escalation-draft"].map(({ id, required }) => ({ id, required }))).toEqual([
      { id: "applicantName", required: true },
      { id: "applicationId", required: true },
      { id: "contact", required: false },
      { id: "bankAccountLastFour", required: false },
      { id: "destination", required: true },
    ]);
  });

  test("rejects model output outside the reviewed document shape", () => {
    const parsed = artifactDraftSchema.safeParse({
      schemaVersion: "scholarship-grievance-v1",
      artifactId: "escalation-draft",
      fields: {
        applicantName: "Asha Singh",
        applicationId: "APP-123",
        contact: "",
        bankAccountLastFour: "1234",
        destination: "NSP grievance portal",
      },
      document: {
        en: { recipient: "NSP grievance officer", subject: "Scholarship payment not credited", body: "Please investigate.", request: "Please reply in writing.", enclosures: "Bank acknowledgement" },
        hi: { recipient: "एनएसपी शिकायत अधिकारी", subject: "छात्रवृत्ति भुगतान जमा नहीं हुआ", body: "कृपया जाँच करें।", request: "कृपया लिखित उत्तर दें।", enclosures: "बैंक पावती" },
      },
      generatedAt: "2026-09-06T10:00:00.000Z",
      model: "openai/gpt-5.6-luna",
      submissionStatus: "submitted",
    });

    expect(parsed.success).toBe(false);
  });

  test("grounds the model prompt in recorded facts and forbids invented events", () => {
    const prompt = buildArtifactPrompt({
      fields: {
        applicantName: "Asha Singh",
        applicationId: "APP-123",
        contact: "",
        bankAccountLastFour: "1234",
        destination: "NSP grievance portal",
      },
      reports: [{
        stepId: "verify-again",
        optionId: "still-missing",
        response: "The portal still shows released but the account was not credited.",
        responseDate: "2026-09-05",
        referenceNumber: "REF-44",
        recordedAt: "2026-09-06T10:00:00.000Z",
        synthetic: true,
      }],
    });

    expect(prompt).toContain("The portal still shows released");
    expect(prompt).toContain("REF-44");
    expect(prompt).toContain("Do not invent");
    expect(prompt).toContain("not submitted");
  });
});
