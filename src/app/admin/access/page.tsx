import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminAccessGateway } from "@/lib/admin/gateway";
import { serverAccess } from "@/lib/auth/server-instance";
import { AdminAccessPanel } from "./admin-access-panel";
import { SignOutButton } from "./sign-out-button";
import { citizenOutcomeService } from "@/lib/citizen-outcome-service";
import { listPublishedWorkflowVersions } from "@/lib/workflow-version";

export default async function AdminAccessPage() {
  const requestHeaders = new Headers(await headers());

  try {
    await serverAccess.requireAdmin(requestHeaders);
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      redirect("/admin/sign-in?next=/admin/access");
    }
    if (error instanceof Error && error.message === "ADMIN_REQUIRED") {
      return (
        <main className="admin-shell">
          <Link className="brand admin-brand" href="/">Sahayak <span>सहायक</span></Link>
          <section className="auth-card">
            <p className="eyebrow">403 · Access denied</p>
            <h1>Administrator access is required</h1>
            <p>Your account does not manage expert access for this workspace.</p>
          </section>
        </main>
      );
    }
    throw error;
  }

  const [initialAccess, outcomeMetrics, publishedWorkflows] = await Promise.all([
    adminAccessGateway.listAccess(requestHeaders),
    citizenOutcomeService.metrics(),
    listPublishedWorkflowVersions(),
  ]);

  return (
    <main className="admin-shell admin-shell-wide">
      <header className="admin-nav">
        <Link className="brand admin-brand" href="/">Sahayak <span>सहायक</span></Link>
        <Link href="/admin/reviews">Review queue</Link>
        <SignOutButton />
      </header>
      <section className="admin-access" aria-labelledby="outcomes-heading">
        <div className="admin-title-row flex items-start justify-between gap-6">
          <div>
            <p className="eyebrow">Citizen outcomes</p>
            <h1 id="outcomes-heading">Awareness is not resolution</h1>
            <p>Real case starts and confirmed resolutions are counted separately.</p>
          </div>
        </div>
        <dl className="admin-metrics">
          <div><dt>Journeys started</dt><dd>{outcomeMetrics.awareCases}</dd></div>
          <div><dt>Resolution confirmed</dt><dd>{outcomeMetrics.resolvedCases}</dd></div>
          <div><dt>With evidence</dt><dd>{outcomeMetrics.evidencedResolvedCases}</dd></div>
        </dl>
      </section>
      <section className="admin-access" aria-labelledby="workflows-heading">
        <div className="admin-title-row">
          <div>
            <p className="eyebrow">Published knowledge</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em]" id="workflows-heading">Existing workflows</h2>
            <p>Only published versions shown here can be found or started by citizens.</p>
          </div>
          <strong className="shrink-0 text-[#2d7255]">{publishedWorkflows.length} live</strong>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {publishedWorkflows.map((workflow) => (
            <Link className="group rounded-2xl border border-[#d8ccb9] bg-white p-5 no-underline transition hover:border-[#2d7255] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--marigold)]" href={`/admin/workflows/${encodeURIComponent(workflow.id)}`} key={workflow.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-[#10251c]">{workflow.definition.title.en}</h3>
                  <p className="mt-1 text-sm text-[#59675f]">{workflow.definition.title.hi}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#eaf3ed] px-3 py-1 text-xs font-bold text-[#2d7255]">
                  v{workflow.version}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e7ddcf] pt-4 text-sm">
                <div>
                  <dt className="text-[#718078]">Jurisdiction</dt>
                  <dd className="mt-1 font-semibold capitalize text-[#263c32]">
                    {workflow.scope === "central"
                      ? "Central"
                      : [workflow.districtCode, workflow.stateCode].filter(Boolean).join(", ")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#718078]">Published</dt>
                  <dd className="mt-1 font-semibold text-[#263c32]">
                    {workflow.publishedAt?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) ?? "—"}
                  </dd>
                </div>
              </dl>
              <span className="mt-4 block text-sm font-bold text-[#2d7255]">Open workflow <span aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>
      </section>
      <AdminAccessPanel initialAccess={initialAccess} />
    </main>
  );
}
