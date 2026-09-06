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
    if (error instanceof Error && error.message === "EXPERT_REQUIRED") return <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]"><section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]"><p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">403 · Access denied</p><h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Verified expert access is required</h1></section></main>;
    throw error;
  }
  let review;
  try {
    review = await reviewCaseService.detail(id);
  } catch {
    return <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]"><section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]"><p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">Review unavailable</p><h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Review case data is unavailable right now</h1></section></main>;
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
