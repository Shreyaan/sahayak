"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { indiaDistricts, indiaStates, jurisdictionLabel } from "@/lib/india-locations";
import { t as translate, type Locale } from "@/lib/locale";
import { getWorkflowDefinition, type CaseSnapshot, type WorkflowDefinition } from "@/lib/workflow";
import type { ReviewJurisdiction } from "@/lib/review-case";
import type { TrustMetadata } from "@/lib/trust";
import { CitizenDiscovery } from "./citizen-discovery";
import { McpCallout } from "./mcp-callout";

export type StoredCase = { id: string; workflowId: string; snapshot: CaseSnapshot; updatedAt: string };
type LibraryItem = {
  id: string;
  workflowVersionId: string;
  version: number;
  definition: WorkflowDefinition;
  jurisdiction: ReviewJurisdiction;
  trust: TrustMetadata;
};

async function loadLibrary(): Promise<LibraryItem[]> {
  const response = await fetch("/api/workflows");
  const body = await response.json();
  if (!response.ok || !Array.isArray(body.workflows)) throw new Error("WORKFLOW_LIBRARY_UNAVAILABLE");
  return body.workflows;
}

function isPast(stored: StoredCase): boolean {
  return stored.snapshot.nodes.some((node) => node.id === "case-done" && node.state === "done");
}

export function CitizenHome({
  locale,
  savedCases,
  feedback,
  onStart,
  onResume,
}: {
  locale: Locale;
  savedCases: StoredCase[];
  feedback: string;
  onStart: (workflowVersionId: string) => Promise<void>;
  onResume: (caseId: string) => void;
}) {
  const text = useTranslations("citizen.home");
  const intro = useTranslations("citizen.intro");
  const [stateCode, setStateCode] = useQueryState("state", { defaultValue: "", history: "replace" });
  const [districtCode, setDistrictCode] = useQueryState("district", { defaultValue: "", history: "replace" });
  const library = useQuery({ queryKey: ["published-workflows"], queryFn: loadLibrary });
  const openCases = savedCases.filter((stored) => !isPast(stored));
  const pastCases = savedCases.filter(isPast);
  const districts = indiaDistricts(stateCode);
  const publishedWorkflows = [...(library.data ?? [])].sort((left, right) =>
    Number(right.id === "scholarship") - Number(left.id === "scholarship"));

  function definitionFor(stored: StoredCase) {
    return library.data?.find((item) => item.workflowVersionId === stored.snapshot.workflowVersionId)?.definition
      ?? getWorkflowDefinition(stored.snapshot.workflowId);
  }

  function caseCard(stored: StoredCase) {
    const definition = definitionFor(stored);
    const active = stored.snapshot.nodes.find((node) => ["needs-you", "verifying", "blocked"].includes(node.state));
    const activeDefinition = definition?.nodes.find((node) => node.id === active?.id);
    const completed = stored.snapshot.nodes.filter((node) => node.state === "done" && node.id !== "case-done").length;
    const total = stored.snapshot.nodes.filter((node) => node.id !== "case-done").length;

    return <button key={stored.id} className="group grid min-w-0 gap-1.5 rounded-2xl border border-[var(--line)] bg-white p-4 text-left text-[var(--ink)] transition-colors hover:border-[var(--green)]" type="button" onClick={() => onResume(stored.id)}>
      <strong className="text-base">{definition ? translate(definition.title, locale) : stored.workflowId}</strong>
      {activeDefinition && <span className="leading-snug text-[#536059]">{text("cases.current")}: {translate(activeDefinition.title, locale)}</span>}
      <small className="text-[#768079]">{text("cases.progress", { completed, total })} · {text("cases.day", { day: stored.snapshot.day })}</small>
      <b className="mt-1.5 text-sm text-[var(--green)] group-hover:underline">{text("cases.resume")} →</b>
    </button>;
  }

  return <>
    <section className="max-w-2xl px-0.5 pb-6 pt-10 max-sm:pt-7">
      <p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("eyebrow")}</p>
      <h1 className="my-2 text-[clamp(2.25rem,5vw,3.5rem)] font-bold leading-[.98] tracking-[-.045em]">{intro("heading")}</h1>
      <p className="m-0 max-w-xl text-lg leading-relaxed text-[#536059]">{intro("lead")}</p>
    </section>

    {feedback && <p className="feedback" role="alert">{feedback}</p>}

    <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-[24px] border border-[var(--line)] bg-white/75 p-6 shadow-[0_18px_50px_rgba(52,43,27,.06)] max-sm:p-4">
        <div className="mb-5">
          <p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("search.eyebrow")}</p>
          <h2 className="mt-1 text-2xl font-bold">{text("search.title")}</h2>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#65716b]">{text("search.copy")}</p>
        </div>
        <CitizenDiscovery locale={locale} stateCode={stateCode || undefined} districtCode={districtCode || undefined} onStart={onStart} />
      </section>

      <section className="border-t-4 border-[var(--green)] bg-[#edf4ee] p-5">
        <h2 className="text-lg font-bold">{text("location.title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#536059]">{text("location.help")}</p>
        <div className="mt-4 grid gap-3">
          <label className="block text-xs font-extrabold text-[#536059]">{text("location.state")}<select className="mt-1 w-full rounded-xl border border-[#b8c8bd] bg-white px-3 py-2.5 text-base text-[var(--ink)]" value={stateCode} onChange={(event) => { void setStateCode(event.target.value || null); void setDistrictCode(null); }}><option value="">{text("location.allIndia")}</option>{indiaStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></label>
          <label className="block text-xs font-extrabold text-[#536059]">{text("location.district")}<select className="mt-1 w-full rounded-xl border border-[#b8c8bd] bg-white px-3 py-2.5 text-base text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-50" value={districtCode} disabled={!stateCode} onChange={(event) => void setDistrictCode(event.target.value || null)}><option value="">{text("location.allDistricts")}</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
        </div>
      </section>
    </div>

    <section className="mt-8">
      <div className="flex items-end justify-between gap-3"><div><p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("cases.eyebrow")}</p><h2 className="mt-1 text-2xl font-bold">{text("cases.open")}</h2></div><span className="font-extrabold text-[var(--green)]">{openCases.length}</span></div>
      {openCases.length ? <div className="mt-3 grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">{openCases.map(caseCard)}</div> : <p className="mt-3 border-l-2 border-[var(--line)] pl-3 text-sm leading-relaxed text-[#65716b]">{text("cases.openEmpty")}</p>}
    </section>

    <section className="mt-8 border-t border-[var(--line)] pt-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("library.eyebrow")}</p><h2 className="mt-1 text-2xl font-bold">{text("library.title")}</h2></div><span className="text-sm font-bold text-[#65716b]">{text("library.count", { count: publishedWorkflows.length })}</span></div>
      <p className="my-2 max-w-2xl text-sm leading-relaxed text-[#536059]">{text("library.copy")}</p>
      {library.isPending && <p className="mt-4 text-sm text-[#65716b]">{text("library.loading")}</p>}
      {library.isError ? <p className="mt-4 border-l-2 border-[#8b2e24] pl-3 text-[#8b2e24]" role="alert">{text("library.error")}</p> : <div className="mt-4 grid grid-cols-2 gap-4 max-sm:grid-cols-1">{publishedWorkflows.map((item) => <article className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 border-t-4 border-[var(--line)] bg-white/55 p-5 text-[var(--ink)] first:border-[var(--marigold)]" key={item.workflowVersionId}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-[var(--green)]">{jurisdictionLabel(item.jurisdiction, locale)}</span>
            {item.id === "scholarship" && <span className="rounded-full bg-[#fff1cf] px-2 py-0.5 text-[.65rem] font-extrabold uppercase tracking-wide text-[#79540d]">{text("library.flagship")}</span>}
          </div>
          <h3 className="mt-2 text-xl font-bold">{translate(item.definition.title, locale)}</h3>
          <p className="mt-1 leading-snug text-[#536059]">{translate(item.definition.subtitle, locale)}</p>
          <small className="mt-3 block text-[#768079]">{text("library.steps", { count: item.definition.nodes.filter((node) => node.type !== "case-complete").length })}</small>
        </div>
        <button className="min-h-11 whitespace-nowrap rounded-xl bg-[var(--marigold)] px-4 font-extrabold text-[#2f250f] max-md:col-span-2 max-md:w-full" type="button" onClick={() => void onStart(item.workflowVersionId)}>{text("library.start")}</button>
      </article>)}</div>}
    </section>

    <section className="mt-10 border-t border-[var(--line)] pt-7">
      <div className="flex items-end justify-between gap-3"><div><p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("cases.eyebrow")}</p><h2 className="mt-1 text-2xl font-bold">{text("cases.past")}</h2></div><span className="grid size-8 place-items-center rounded-full bg-[#e7efe9] font-extrabold text-[var(--green)]">{pastCases.length}</span></div>
      {pastCases.length ? <div className="mt-3.5 grid grid-cols-2 gap-3 max-sm:grid-cols-1">{pastCases.map(caseCard)}</div> : <p className="mt-3.5 rounded-2xl border border-dashed border-[var(--line)] p-4 text-[#65716b]">{text("cases.pastEmpty")}</p>}
    </section>

    <section className="mt-8"><McpCallout compact /></section>
  </>;
}
