import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { z } from "zod";
import { reviewCaseService } from "@/lib/review-case-service-instance";
import { verifyContributionPreview } from "@/lib/contribution-preview";

const submitSchema = z.object({
  confirmed: z.literal(true),
  previewToken: z.string().trim().min(1).max(20_000),
}).strict();

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return failure("RATE_LIMITED", "Too many requests. Please try again shortly.", 429);
  }

  const parsed = submitSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return failure("INVALID_SUBMISSION", "Confirm the preview before submitting.", 400);
  }

  try {
    const preview = verifyContributionPreview(parsed.data.previewToken);
    const reviewCase = await reviewCaseService.create({
      submittedTitle: preview.submittedTitle,
      input: preview.input,
      jurisdiction: preview.jurisdiction,
      draft: preview.draft,
    });
    return NextResponse.json({
      reviewCaseId: reviewCase.id,
      reviewUrl: `/admin/reviews/${encodeURIComponent(reviewCase.id)}`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_PREVIEW_TOKEN") {
      return failure("INVALID_PREVIEW_TOKEN", "Preview the contribution again before submitting.", 400);
    }
    if (error instanceof Error && error.message === "DATABASE_UNAVAILABLE") {
      return failure("DATABASE_UNAVAILABLE", "Review submissions are unavailable right now.", 503);
    }
    return failure("SUBMISSION_FAILED", "The review case could not be saved. Please try again.", 503);
  }
}
