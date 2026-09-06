import { beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { seedPublishedWorkflows } from "@/db/seed";
import { store } from "@/lib/store";
import { startCase } from "@/lib/workflow";
import { GET, PATCH, POST } from "./[id]/artifacts/[artifactId]/route";

const ownerToken = randomUUID();
const ownerHash = createHash("sha256").update(ownerToken).digest("hex");

describe("GET /api/cases/:id/artifacts/:artifactId", () => {
  beforeAll(seedPublishedWorkflows);

  test("downloads the saved AI draft as an editable Word document", async () => {
    const id = randomUUID();
    const snapshot = {
      ...startCase("scholarship", "scholarship-v4"),
      artifacts: ["escalation-draft" as const],
      artifactDrafts: {
        "escalation-draft": {
          schemaVersion: "scholarship-grievance-v1" as const,
          artifactId: "escalation-draft" as const,
          fields: {
            applicantName: "Asha Singh",
            applicationId: "APP-123",
            contact: "",
            bankAccountLastFour: "1234",
            destination: "NSP grievance portal",
          },
          document: {
            en: { recipient: "NSP grievance officer", subject: "Scholarship payment not credited", body: "My saved case records that the amount was not credited.", request: "Please investigate and reply in writing.", enclosures: "Bank acknowledgement REF-44" },
            hi: { recipient: "एनएसपी शिकायत अधिकारी", subject: "छात्रवृत्ति भुगतान जमा नहीं हुआ", body: "मेरे सहेजे गए केस में राशि जमा न होने का रिकॉर्ड है।", request: "कृपया जाँच कर लिखित उत्तर दें।", enclosures: "बैंक पावती REF-44" },
          },
          generatedAt: "2026-09-06T10:00:00.000Z",
          model: "openai/gpt-5.6-luna",
        },
      },
    };
    await store.saveCase(id, snapshot, ownerHash);

    const request = new Request(`http://localhost/api/cases/${id}/artifacts/escalation-draft?locale=en`);
    request.headers.set("cookie", `sahayak-browser=${ownerToken}`);
    const response = await GET(request, { params: Promise.resolve({ id, artifactId: "escalation-draft" }) });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  test("downloads an earned workflow artifact without asking AI to rewrite it", async () => {
    const id = randomUUID();
    await store.saveCase(id, {
      ...startCase("scholarship", "scholarship-v4"),
      artifacts: ["npci-checklist"],
    }, ownerHash);

    const request = new Request(`http://localhost/api/cases/${id}/artifacts/npci-checklist?locale=en`);
    request.headers.set("cookie", `sahayak-browser=${ownerToken}`);
    const response = await GET(request, { params: Promise.resolve({ id, artifactId: "npci-checklist" }) });
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("sahayak-npci-checklist-en.docx");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });

  test("does not offer AI generation for a fixed workflow artifact", async () => {
    const id = randomUUID();
    await store.saveCase(id, {
      ...startCase("scholarship", "scholarship-v4"),
      artifacts: ["npci-checklist"],
    }, ownerHash);

    const request = new Request(`http://localhost/api/cases/${id}/artifacts/npci-checklist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    request.headers.set("cookie", `sahayak-browser=${ownerToken}`);
    const response = await POST(request, { params: Promise.resolve({ id, artifactId: "npci-checklist" }) });

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      code: "ARTIFACT_NOT_EDITABLE",
      error: "This workflow artifact is fixed guidance and cannot be AI-edited.",
    });
  });

  test("does not expose a private artifact to another browser", async () => {
    const id = randomUUID();
    await store.saveCase(id, { ...startCase("scholarship", "scholarship-v4"), artifacts: ["escalation-draft"] }, ownerHash);

    const request = new Request(`http://localhost/api/cases/${id}/artifacts/escalation-draft`);
    request.headers.set("cookie", `sahayak-browser=${randomUUID()}`);
    const response = await GET(request, { params: Promise.resolve({ id, artifactId: "escalation-draft" }) });

    expect(response.status).toBe(404);
  });

  test("does not let an edit overwrite AI provenance", async () => {
    const id = randomUUID();
    const snapshot = {
      ...startCase("scholarship", "scholarship-v4"),
      artifacts: ["escalation-draft" as const],
      artifactDrafts: {
        "escalation-draft": {
          schemaVersion: "scholarship-grievance-v1" as const,
          artifactId: "escalation-draft" as const,
          fields: { applicantName: "Asha", applicationId: "APP-1", contact: "", bankAccountLastFour: "", destination: "Portal" },
          document: {
            en: { recipient: "Portal", subject: "Subject", body: "Original body", request: "Reply in writing", enclosures: "" },
            hi: { recipient: "पोर्टल", subject: "विषय", body: "मूल विवरण", request: "लिखित उत्तर दें", enclosures: "" },
          },
          generatedAt: "2026-09-06T10:00:00.000Z",
          model: "openai/gpt-5.6-luna",
        },
      },
    };
    await store.saveCase(id, snapshot, ownerHash);
    const request = new Request(`http://localhost/api/cases/${id}/artifacts/escalation-draft`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...snapshot.artifactDrafts["escalation-draft"], model: "forged-model" }),
    });
    request.headers.set("cookie", `sahayak-browser=${ownerToken}`);

    const response = await PATCH(request, { params: Promise.resolve({ id, artifactId: "escalation-draft" }) });

    expect(response.status).toBe(400);
  });
});
