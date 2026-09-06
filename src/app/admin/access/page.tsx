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
        <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]">
          <Link className="text-[1.3rem] font-extrabold inline-block text-[var(--ink)] no-underline" href="/">Sahayak <span className="ml-1.5 text-[.85rem] text-[var(--green)]">सहायक</span></Link>
          <section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]">
            <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">403 · Access denied</p>
            <h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">Administrator access is required</h1>
            <p className="leading-[1.5] text-[#536059]">Your account does not manage expert access for this workspace.</p>
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
    <main className="mx-auto min-h-screen w-full max-w-[880px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Link className="text-[1.3rem] font-extrabold inline-block text-[var(--ink)] no-underline" href="/">Sahayak <span className="ml-1.5 text-[.85rem] text-[var(--green)]">सहायक</span></Link>
        <Link href="/admin/reviews">Review queue</Link>
        <SignOutButton />
      </header>
      <section className="grid gap-[18px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(18px,5vw,32px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]" aria-labelledby="outcomes-heading">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] leading-[1.5] text-[#536059]">Citizen outcomes</p>
            <h1 className="mt-2 mb-1 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]" id="outcomes-heading">Awareness is not resolution</h1>
            <p className="text-[#536059] leading-[1.5]">Real case starts and confirmed resolutions are counted separately.</p>
          </div>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2.5 max-[560px]:grid-cols-1">
          <div className="p-3.5 border border-[var(--line)] rounded-[14px] bg-white"><dt className="text-[#69736e] text-[.75rem] font-extrabold">Journeys started</dt><dd className="mt-1.5 text-[var(--green)] text-[1.7rem] font-black">{outcomeMetrics.awareCases}</dd></div>
          <div className="p-3.5 border border-[var(--line)] rounded-[14px] bg-white"><dt className="text-[#69736e] text-[.75rem] font-extrabold">Resolution confirmed</dt><dd className="mt-1.5 text-[var(--green)] text-[1.7rem] font-black">{outcomeMetrics.resolvedCases}</dd></div>
          <div className="p-3.5 border border-[var(--line)] rounded-[14px] bg-white"><dt className="text-[#69736e] text-[.75rem] font-extrabold">With evidence</dt><dd className="mt-1.5 text-[var(--green)] text-[1.7rem] font-black">{outcomeMetrics.evidencedResolvedCases}</dd></div>
        </dl>
      </section>
      <section className="mt-[18px] grid gap-[18px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(18px,5vw,32px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]" aria-labelledby="workflows-heading">
        <div>
          <div>
            <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] leading-[1.5] text-[#536059]">Published knowledge</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.03em]" id="workflows-heading">Existing workflows</h2>
            <p className="text-[#536059] leading-[1.5]">Only published versions shown here can be found or started by citizens.</p>
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
                  {(workflow.workflowId === "scholarship" || workflow.workflowId === "bereavement") && <span className="mt-2 inline-flex rounded-full bg-[#fff1cf] px-2 py-1 text-xs font-bold text-[#79540d]">Synthetic example workflow</span>}
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
