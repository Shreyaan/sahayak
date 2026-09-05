import { z } from "zod";
import type { ReviewCase, ReviewStatus } from "@/lib/review-case-service";
import type { ReviewJurisdiction } from "@/lib/review-case";
import { wordingEditSchema, type WordingEdit } from "@/lib/review-comparison";

const filtersSchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  jurisdiction: z.enum(["central", "state", "district"]).optional(),
}).strict();

const idSchema = z.string().uuid();
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("select-baseline"), baselineWorkflowVersionId: z.string().trim().min(1).max(128).nullable() }).strict(),
  z.object({ action: z.literal("save-wording"), expectedHash: z.string().regex(/^[a-f0-9]{64}$/), wording: wordingEditSchema }).strict(),
]);

type ReviewGateway = {
  requireExpert(headers: Headers): Promise<{ userId: string }>;
  list(filters: { status?: ReviewStatus; scope?: ReviewJurisdiction["scope"] }): Promise<ReviewCase[]>;
  get(id: string): Promise<ReviewCase | null>;
  detail?(id: string): Promise<unknown | null>;
  saveWording?(input: { caseId: string; expectedHash: string; wording: WordingEdit; editorId: string }): Promise<ReviewCase>;
  selectBaseline?(input: { caseId: string; baselineWorkflowVersionId: string | null }): Promise<ReviewCase>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "REVIEW_DATABASE_FAILED";
  const known: Record<string, [number, string]> = {
    AUTH_REQUIRED: [401, "Please sign in."],
    EXPERT_REQUIRED: [403, "Verified expert access is required."],
    DATABASE_UNAVAILABLE: [503, "Review cases are unavailable right now."],
    REVIEW_CASE_INVALID_DATA: [503, "Review case data is unavailable right now."],
    STALE_REVISION: [409, "This review changed. Reload it before saving."],
    REVIEW_CASE_READ_ONLY: [409, "Published or rejected reviews are read-only."],
    BASELINE_NOT_PUBLISHED: [400, "Choose a published workflow version or no baseline."],
    REVIEW_CASE_NOT_FOUND: [404, "That review case was not found."],
    INVALID_WORDING_EDIT: [400, "Only complete bilingual wording can be changed."],
  };
  const [status, message] = known[code] ?? [503, "Review cases are unavailable right now."];
  return json({ error: { code: known[code] ? code : "REVIEW_DATABASE_FAILED", message } }, status);
}

export function createReviewHandlers(gateway: ReviewGateway) {
  return {
    async list(request: Request) {
      try {
        await gateway.requireExpert(request.headers);
      } catch (error) {
        return failure(error);
      }
      const query = Object.fromEntries(new URL(request.url).searchParams);
      const parsed = filtersSchema.safeParse(query);
      if (!parsed.success) {
        return json({ error: { code: "INVALID_FILTER", message: "Choose a valid review status and jurisdiction." } }, 400);
      }
      try {
        const reviews = await gateway.list({ status: parsed.data.status, scope: parsed.data.jurisdiction });
        return json({ reviews: reviews.map((review) => ({
          id: review.id, title: review.currentRevision.content.title, status: review.status,
          jurisdiction: review.jurisdiction, sourceChannel: review.sourceChannel,
          updatedAt: review.updatedAt, decisionCount: 0,
        })) });
      } catch (error) {
        return failure(error);
      }
    },

    async detail(request: Request, id: string) {
      try {
        await gateway.requireExpert(request.headers);
      } catch (error) {
        return failure(error);
      }
      if (!idSchema.safeParse(id).success) {
        return json({ error: { code: "REVIEW_CASE_NOT_FOUND", message: "That review case was not found." } }, 404);
      }
      try {
        const review = await (gateway.detail ? gateway.detail(id) : gateway.get(id));
        return review
          ? json({ review, decisionCount: 0 })
          : json({ error: { code: "REVIEW_CASE_NOT_FOUND", message: "That review case was not found." } }, 404);
      } catch (error) {
        return failure(error);
      }
    },

    async patch(request: Request, id: string) {
      let expert;
      try {
        expert = await gateway.requireExpert(request.headers);
      } catch (error) {
        return failure(error);
      }
      if (!idSchema.safeParse(id).success) return json({ error: { code: "REVIEW_CASE_NOT_FOUND", message: "That review case was not found." } }, 404);
      const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return json({ error: { code: "INVALID_REVIEW_MUTATION", message: "Choose a valid baseline or complete wording edit." } }, 400);
      try {
        const review = parsed.data.action === "select-baseline"
          ? await gateway.selectBaseline!({ caseId: id, baselineWorkflowVersionId: parsed.data.baselineWorkflowVersionId })
          : await gateway.saveWording!({ caseId: id, expectedHash: parsed.data.expectedHash, wording: parsed.data.wording, editorId: expert.userId });
        return json({ review });
      } catch (error) {
        return failure(error);
      }
    },
  };
}
