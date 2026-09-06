import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverAccess } from "@/lib/auth/server-instance";
import { getPublishedWorkflowVersion } from "@/lib/workflow-version";
import type { WorkflowNode } from "@/lib/workflow";

type Locale = "en" | "hi";

function StepTranslation({
  node,
  locale,
}: {
  node: WorkflowNode;
  locale: Locale;
}) {
  const language = locale === "en" ? "English" : "हिन्दी";

  return (
    <section className="min-w-0 rounded-xl bg-white p-4" lang={locale}>
      <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">
        {language}
      </p>
      <h4 className="mt-2 text-lg font-extrabold text-[#10251c]">
        {node.title[locale]}
      </h4>
      <p className="mt-3 leading-6 text-[#425149]">{node.detail[locale]}</p>
      <div className="mt-4 border-t border-[#e6ddcf] pt-4">
        <p className="text-xs font-bold uppercase tracking-[.08em] text-[#718078]">
          Citizen check-in
        </p>
        <p className="mt-1 leading-6 text-[#263c32]">{node.ask[locale]}</p>
      </div>

      {node.visit && (
        <dl className="mt-4 grid gap-3 border-t border-[#e6ddcf] pt-4 text-sm">
          <div>
            <dt className="font-bold text-[#718078]">Where to go</dt>
            <dd className="mt-1 text-[#263c32]">{node.visit.office[locale]}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">Why</dt>
            <dd className="mt-1 text-[#263c32]">{node.visit.why[locale]}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">What to carry</dt>
            <dd className="mt-1 text-[#263c32]">
              {node.visit.carry.map((item) => item[locale]).join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">What to say</dt>
            <dd className="mt-1 text-[#263c32]">{node.visit.script[locale]}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">What to expect</dt>
            <dd className="mt-1 text-[#263c32]">{node.visit.expect[locale]}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">Proof to collect</dt>
            <dd className="mt-1 text-[#263c32]">
              {node.visit.collect[locale]}
            </dd>
          </div>
        </dl>
      )}

      {node.link && (
        <dl className="mt-4 grid gap-3 border-t border-[#e6ddcf] pt-4 text-sm">
          <div>
            <dt className="font-bold text-[#718078]">Online action</dt>
            <dd className="mt-1 text-[#263c32]">{node.link.action[locale]}</dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">Proof to collect</dt>
            <dd className="mt-1 text-[#263c32]">{node.link.collect[locale]}</dd>
          </div>
        </dl>
      )}

      <details className="mt-4 border-t border-[#e6ddcf] pt-4 text-sm">
        <summary className="cursor-pointer font-bold text-[var(--green)]">
          Responses and journey replies
        </summary>
        <dl className="mt-3 grid gap-3">
          <div>
            <dt className="font-bold text-[#718078]">
              {node.confirmLabel?.[locale] ?? "Confirm"}
            </dt>
            <dd className="mt-1 text-[#263c32]">
              {node.onConfirm.reply[locale]}
            </dd>
          </div>
          {node.onDecline && (
            <div>
              <dt className="font-bold text-[#718078]">
                {node.declineLabel?.[locale] ?? "Decline"}
              </dt>
              <dd className="mt-1 text-[#263c32]">
                {node.onDecline.reply[locale]}
              </dd>
            </div>
          )}
          {node.verify && (
            <div>
              <dt className="font-bold text-[#718078]">Verification result</dt>
              <dd className="mt-1 text-[#263c32]">
                {node.verify.outcome.reply[locale]}
              </dd>
            </div>
          )}
          {node.report?.options.map((option) => (
            <div key={option.id}>
              <dt className="font-bold text-[#718078]">
                {option.label[locale]}
              </dt>
              <dd className="mt-1 text-[#263c32]">{option.reply[locale]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

export default async function PublishedWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const path = `/admin/workflows/${encodeURIComponent(id)}`;

  try {
    await serverAccess.requireAdmin(new Headers(await headers()));
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      redirect(`/admin/sign-in?next=${encodeURIComponent(path)}`);
    }
    if (error instanceof Error && error.message === "ADMIN_REQUIRED") {
      return (
        <main className="mx-auto min-h-screen w-full max-w-[620px] px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px]">
          <section className="mt-[42px] rounded-[22px] border border-[var(--line)] bg-white/70 p-[clamp(20px,6vw,36px)] shadow-[0_14px_40px_rgba(52,43,27,.07)]">
            <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">
              403 · Access denied
            </p>
            <h1 className="my-2 text-[clamp(2rem,7vw,3rem)] leading-[1.05] tracking-[-.04em]">
              Administrator access is required
            </h1>
          </section>
        </main>
      );
    }
    throw error;
  }

  const workflow = await getPublishedWorkflowVersion(id);
  if (!workflow) notFound();

  const jurisdiction =
    workflow.scope === "central"
      ? "Central"
      : [workflow.districtCode, workflow.stateCode].filter(Boolean).join(", ");

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link
          className="text-xl font-extrabold text-[var(--ink)] no-underline"
          href="/"
        >
          Sahayak <span className="text-sm text-[var(--green)]">सहायक</span>
        </Link>
        <nav className="flex gap-5 text-sm font-bold text-[var(--green)]">
          <Link href="/admin/access">Dashboard</Link>
          <Link href="/admin/reviews">Review queue</Link>
        </nav>
      </header>

      <section className="rounded-[22px] border border-[var(--line)] bg-white/70 p-7 shadow-[0_14px_40px_rgba(52,43,27,0.07)] max-sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">
              Published workflow · version {workflow.version}
            </p>
            <h1 className="mt-3 max-w-3xl text-[clamp(2.25rem,5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.04em]">
              {workflow.definition.title.en}
            </h1>
            <p className="mt-3 text-lg text-[#425149]">
              {workflow.definition.title.hi}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[#eaf3ed] px-3 py-1 text-sm font-bold text-[#2d7255]">
              Live
            </span>
            {/* {(workflow.workflowId === "scholarship" || workflow.workflowId === "bereavement") && <span className="rounded-full bg-[#fff1cf] px-3 py-1 text-sm font-bold text-[#79540d]">Synthetic example workflow</span>} */}
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">
              English summary
            </p>
            <p className="mt-2 text-lg leading-7 text-[#59675f]">
              {workflow.definition.subtitle.en}
            </p>
          </div>
          <div lang="hi">
            <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">
              हिन्दी सारांश
            </p>
            <p className="mt-2 text-lg leading-7 text-[#59675f]">
              {workflow.definition.subtitle.hi}
            </p>
          </div>
        </div>
        <dl className="mt-7 grid gap-4 border-t border-[var(--line)] pt-6 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-bold text-[#718078]">Jurisdiction</dt>
            <dd className="mt-1 font-semibold text-[#263c32]">
              {jurisdiction}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">Exact version ID</dt>
            <dd className="mt-1 break-all font-semibold text-[#263c32]">
              {workflow.id}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-[#718078]">Published</dt>
            <dd className="mt-1 font-semibold text-[#263c32]">
              {workflow.publishedAt?.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }) ?? "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--line)] bg-white/70 p-7 max-sm:p-5">
        <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">
          Citizen journey
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-[-0.03em]">
          {workflow.definition.nodes.length} ordered actions
        </h2>
        <ol className="mt-6 grid gap-4">
          {workflow.definition.nodes.map((node, index) => (
            <li
              className="rounded-2xl border border-[#ded4c4] bg-[#f6f0e7] p-5"
              key={node.id}
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2d7255] text-sm font-black text-white">
                  {index + 1}
                </span>
                <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[#718078]">
                  {node.type.replaceAll("-", " ")}
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <StepTranslation locale="en" node={node} />
                <StepTranslation locale="hi" node={node} />
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
