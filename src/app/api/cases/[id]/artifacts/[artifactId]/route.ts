import { NextResponse } from "next/server";
import { z } from "zod";
import { artifactDraftSchema, generateScholarshipGrievance, generatedGrievanceSchema, scholarshipGrievanceFieldsSchema } from "@/lib/artifact-drafts";
import { buildArtifactDocument, buildTemplateArtifactDocument } from "@/lib/artifact-document";
import { artifactContent, renderArtifactBody } from "@/lib/artifacts";
import { existingBrowserOwnerHash } from "@/lib/browser-owner";
import { artifactIdSchema, isSyntheticSeed } from "@/lib/workflow";
import { store } from "@/lib/store";
import type { StoredCase } from "@/lib/store";

type Context = { params: Promise<{ id: string; artifactId: string }> };
const paramsSchema = z.object({ id: z.string().uuid(), artifactId: artifactIdSchema }).strict();
const localeSchema = z.enum(["en", "hi"]);
const editSchema = z.object({ document: generatedGrievanceSchema }).strict();

type OwnedCaseResult =
  | { error: NextResponse }
  | { savedCase: StoredCase; ownerHash: string; params: z.infer<typeof paramsSchema> };

async function ownedCase(request: Request, context: Context): Promise<OwnedCaseResult> {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return { error: NextResponse.json({ code: "INVALID_ARTIFACT", error: "That artifact identifier is invalid." }, { status: 400 }) };
  const ownerHash = existingBrowserOwnerHash(request);
  if (!ownerHash) return { error: NextResponse.json({ code: "CASE_ACCESS_REQUIRED", error: "This case belongs to another browser." }, { status: 401 }) };
  try {
    const savedCase = await store.getCase(parsed.data.id, ownerHash);
    if (!savedCase) return { error: NextResponse.json({ code: "CASE_NOT_FOUND", error: "That case was not found." }, { status: 404 }) };
    if (!savedCase.snapshot.artifacts.includes(parsed.data.artifactId)) {
      return { error: NextResponse.json({ code: "ARTIFACT_NOT_READY", error: "This case has not reached that artifact yet." }, { status: 409 }) };
    }
    return { savedCase, ownerHash, params: parsed.data };
  } catch {
    return { error: NextResponse.json({ code: "DATABASE_UNAVAILABLE", error: "The case is unavailable right now." }, { status: 503 }) };
  }
}

export async function POST(request: Request, context: Context) {
  const owned = await ownedCase(request, context);
  if ("error" in owned) return owned.error;
  if (owned.params.artifactId !== "escalation-draft") {
    return NextResponse.json({ code: "ARTIFACT_NOT_EDITABLE", error: "This workflow artifact is fixed guidance and cannot be AI-edited." }, { status: 405 });
  }
  const parsed = scholarshipGrievanceFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_ARTIFACT_FIELDS", error: "Complete the required grievance fields and check the account digits." }, { status: 400 });
  }

  try {
    const draft = await generateScholarshipGrievance(parsed.data, owned.savedCase.snapshot.reports ?? []);
    await store.saveArtifactDraft(owned.savedCase.id, draft, owned.ownerHash);
    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof Error && error.message === "AI_UNAVAILABLE") {
      return NextResponse.json({ code: "AI_UNAVAILABLE", error: "AI drafting is unavailable until OpenRouter is configured." }, { status: 503 });
    }
    return NextResponse.json({ code: "AI_DRAFT_FAILED", error: "The grievance draft could not be prepared. Your case was not changed." }, { status: 502 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const owned = await ownedCase(request, context);
  if ("error" in owned) return owned.error;
  if (owned.params.artifactId !== "escalation-draft") {
    return NextResponse.json({ code: "ARTIFACT_NOT_EDITABLE", error: "This workflow artifact is fixed guidance and cannot be AI-edited." }, { status: 405 });
  }
  const existingDraft = artifactDraftSchema.safeParse(owned.savedCase.snapshot.artifactDrafts?.["escalation-draft"]);
  if (!existingDraft.success) return NextResponse.json({ code: "ARTIFACT_NOT_GENERATED", error: "Generate the grievance before editing it." }, { status: 409 });
  const parsed = editSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_ARTIFACT_DRAFT", error: "The edited draft is incomplete." }, { status: 400 });
  try {
    const draft = { ...existingDraft.data, document: parsed.data.document };
    await store.saveArtifactDraft(owned.savedCase.id, draft, owned.ownerHash);
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ code: "SAVE_FAILED", error: "The edited draft was not saved. Please try again." }, { status: 503 });
  }
}

export async function GET(request: Request, context: Context) {
  const owned = await ownedCase(request, context);
  if ("error" in owned) return owned.error;
  const url = new URL(request.url);
  const locale = localeSchema.catch("en").parse(url.searchParams.get("locale"));

  try {
    const artifactId = owned.params.artifactId;
    const synthetic = isSyntheticSeed(owned.savedCase.snapshot.workflowId);
    let bytes: ArrayBuffer;
    if (artifactId === "escalation-draft") {
      const draft = artifactDraftSchema.safeParse(owned.savedCase.snapshot.artifactDrafts?.[artifactId]);
      if (!draft.success) return NextResponse.json({ code: "ARTIFACT_NOT_GENERATED", error: "Generate and review the grievance before downloading it." }, { status: 409 });
      bytes = await buildArtifactDocument(draft.data, locale, synthetic);
    } else {
      bytes = await buildTemplateArtifactDocument(
        artifactContent[artifactId].title[locale],
        renderArtifactBody(artifactId, owned.savedCase.snapshot, locale),
        locale,
        synthetic,
      );
    }
    return new Response(bytes, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="sahayak-${artifactId}-${locale}.docx"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ code: "DOCUMENT_FAILED", error: "The document could not be created right now." }, { status: 500 });
  }
}
