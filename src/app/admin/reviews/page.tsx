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
  return <main className="admin-shell"><section className="auth-card"><p className="eyebrow">403 · Access denied</p><h1>Verified expert access is required</h1></section></main>;
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
    return <main className="admin-shell"><section className="auth-card"><p className="eyebrow">Review unavailable</p><h1>Review cases are unavailable right now</h1></section></main>;
  }
  return <main className="admin-shell admin-shell-wide"><header className="admin-nav"><Link className="brand admin-brand" href="/">Sahayak <span>सहायक</span></Link><Link href="/admin/access">Access</Link></header><section className="admin-access"><p className="eyebrow">Expert review</p><h1>Review cases</h1><form method="get" className="contribution-actions"><select name="status" defaultValue={parsed.success ? parsed.data.status : ""} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="rejected">Rejected</option></select><select name="jurisdiction" defaultValue={parsed.success ? parsed.data.jurisdiction : ""} aria-label="Jurisdiction"><option value="">All jurisdictions</option><option value="central">Central</option><option value="state">State</option><option value="district">District</option></select><button className="secondary-action">Filter</button></form>{!parsed.success && <p role="alert">Invalid filters were ignored.</p>}<div className="journey-grid">{reviews.map((review) => <Link className="journey" key={review.id} href={`/admin/reviews/${review.id}`}><strong>{review.currentRevision.content.title.en}</strong><small>{review.status} · {review.jurisdiction.scope}{review.jurisdiction.stateCode ? ` · ${review.jurisdiction.stateCode}` : ""}{review.jurisdiction.districtCode ? `/${review.jurisdiction.districtCode}` : ""}</small><small>{review.sourceChannel} · {new Date(review.updatedAt).toLocaleString()} · 0 decisions</small></Link>)}</div></section></main>;
}
