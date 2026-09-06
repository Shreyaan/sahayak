import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverAccess } from "@/lib/auth/server-instance";
import { reviewCaseService } from "@/lib/review-case-service-instance";
import { ReviewDetailClient } from "./review-detail-client";

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = `/admin/reviews/${encodeURIComponent(id)}`;
  try {
    await serverAccess.requireExpert(new Headers(await headers()));
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") redirect(`/admin/sign-in?next=${encodeURIComponent(path)}`);
    if (error instanceof Error && error.message === "EXPERT_REQUIRED") return <main className="admin-shell"><section className="auth-card"><p className="eyebrow">403 · Access denied</p><h1>Verified expert access is required</h1></section></main>;
    throw error;
  }
  let review;
  try {
    review = await reviewCaseService.detail(id);
  } catch {
    return <main className="admin-shell"><section className="auth-card"><p className="eyebrow">Review unavailable</p><h1>Review case data is unavailable right now</h1></section></main>;
  }
  if (!review) notFound();
  return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
    <header className="mb-8 flex items-center justify-between">
      <Link className="text-xl font-extrabold text-[var(--ink)] no-underline" href="/">Sahayak <span className="text-sm text-[var(--green)]">सहायक</span></Link>
      <nav className="flex gap-5 text-sm font-bold text-[var(--green)]"><Link href="/admin/reviews">Review queue</Link><Link href="/admin/access">Access</Link></nav>
    </header>
    <ReviewDetailClient reviewId={id} initialReview={review} />
  </main>;
}
