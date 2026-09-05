import { z } from "zod";
import { serverAccess } from "@/lib/auth/server-instance";
import { isRateLimited } from "@/lib/rate-limit";
import { reviewCaseService } from "@/lib/review-case-service-instance";
import { fillMissingTranslations, translatableWordingSchema } from "@/lib/review-translation";

const requestSchema = z.object({
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  wording: translatableWordingSchema,
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await serverAccess.requireExpert(request.headers);
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPERT_REQUIRED";
    return Response.json({ error: { code, message: code === "AUTH_REQUIRED" ? "Please sign in." : "Verified expert access is required." } }, { status: code === "AUTH_REQUIRED" ? 401 : 403 });
  }

  if (isRateLimited(request)) {
    return Response.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } }, { status: 429 });
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: { code: "REVIEW_CASE_NOT_FOUND", message: "That review case was not found." } }, { status: 404 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: { code: "INVALID_TRANSLATION_REQUEST", message: "Complete English wording is required." } }, { status: 400 });
  }

  try {
    const review = await reviewCaseService.detail(id);
    if (!review) throw new Error("REVIEW_CASE_NOT_FOUND");
    if (review.status !== "draft") throw new Error("REVIEW_CASE_READ_ONLY");
    if (review.currentRevision.contentHash !== parsed.data.expectedHash) throw new Error("STALE_REVISION");
    const expectedIds = review.currentRevision.content.definition.nodes.map((node) => node.id);
    const receivedIds = parsed.data.wording.nodes.map((node) => node.id);
    if (expectedIds.length !== receivedIds.length || expectedIds.some((nodeId, index) => nodeId !== receivedIds[index])) {
      throw new Error("INVALID_TRANSLATION_REQUEST");
    }
    const wording = await fillMissingTranslations(parsed.data.wording);
    return Response.json({ wording });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AI_UNAVAILABLE";
    const known: Record<string, [number, string]> = {
      REVIEW_CASE_NOT_FOUND: [404, "That review case was not found."],
      REVIEW_CASE_READ_ONLY: [409, "Published or rejected reviews are read-only."],
      STALE_REVISION: [409, "This review changed. Reload it before translating."],
      INVALID_TRANSLATION_REQUEST: [400, "The editable workflow structure changed."],
      AI_INVALID_RESPONSE: [502, "AI did not return complete translated wording."],
      AI_UNAVAILABLE: [503, "AI translation is unavailable right now."],
    };
    const [status, message] = known[code] ?? known.AI_UNAVAILABLE!;
    return Response.json({ error: { code: known[code] ? code : "AI_UNAVAILABLE", message } }, { status });
  }
}
