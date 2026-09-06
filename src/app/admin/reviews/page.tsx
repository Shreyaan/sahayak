import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverAccess } from "@/lib/auth/server-instance";
import { reviewCaseService } from "@/lib/review-case-service-instance";

const filterSchema = z.object({
  status: z.enum(["draft", "published", "rejected"]).optional(),
  jurisdiction: z.enum(["central", "state", "district"]).optional(),
});

function denied() {
  return <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]"><section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]"><p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">403 · Access denied</p><h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Verified expert access is required</h1></section></main>;
}

function exactQueuePath(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const search = query.toString();
  return search ? `/admin/reviews?${search}` : "/admin/reviews";
}

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const parsed = filterSchema.safeParse({ status: params.status, jurisdiction: params.jurisdiction });
  const next = exactQueuePath(params);
  try {
    await serverAccess.requireExpert(new Headers(await headers()));
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") redirect(`/admin/sign-in?next=${encodeURIComponent(next)}`);
    if (error instanceof Error && error.message === "EXPERT_REQUIRED") return denied();
    throw error;
  }
  let reviews;
  try {
    reviews = await reviewCaseService.list(parsed.success ? { status: parsed.data.status, scope: parsed.data.jurisdiction } : {});
  } catch {
    return <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]"><section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]"><p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">Review unavailable</p><h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Review cases are unavailable right now</h1></section></main>;
  }
  return <main className="mx-auto min-h-screen w-full max-w-[880px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]"><header className="mb-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"><Link className="text-[1.3rem] font-extrabold inline-block text-[var(--ink)] no-underline" href="/">Sahayak <span className="ml-1.5 text-[.85rem] text-[var(--green)]">सहायक</span></Link><Link href="/admin/access">Access</Link></header><section className="grid gap-[18px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(18px,5vw,32px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]"><p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">Expert review</p><h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Review cases</h1><form method="get" className="mt-3.5 flex items-center justify-between gap-2.5"><select name="status" defaultValue={parsed.success ? parsed.data.status : ""} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="rejected">Rejected</option></select><select name="jurisdiction" defaultValue={parsed.success ? parsed.data.jurisdiction : ""} aria-label="Jurisdiction"><option value="">All jurisdictions</option><option value="central">Central</option><option value="state">State</option><option value="district">District</option></select><button className="rounded-xl border-0 bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)]">Filter</button></form>{!parsed.success && <p role="alert">Invalid filters were ignored.</p>}<div className="grid gap-3 w-full">{reviews.map((review) => <Link className="grid gap-1 min-h-11 p-[18px] rounded-[22px] border border-[var(--line)] bg-white/55 shadow-[0_14px_40px_rgba(52,43,27,.07)] text-[var(--ink)] text-left" key={review.id} href={`/admin/reviews/${review.id}`}><strong className="text-[1.1rem]">{review.currentRevision.content.title.en}</strong><small className="text-[#7a827e]">{review.status} · {review.jurisdiction.scope}{review.jurisdiction.stateCode ? ` · ${review.jurisdiction.stateCode}` : ""}{review.jurisdiction.districtCode ? `/${review.jurisdiction.districtCode}` : ""}</small><small className="text-[#7a827e]">{review.sourceChannel} · {new Date(review.updatedAt).toLocaleString()} · 0 decisions</small></Link>)}</div></section></main>;
}
