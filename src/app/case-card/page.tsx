"use client";

import { useLocale, useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { artifactContent, renderArtifactBody } from "@/lib/artifacts";
import { t as translate, tList, type Locale } from "@/lib/locale";
import {
  getCaseWorkflowDefinition,
  isClearedBlocker,
  isSyntheticSeed,
  nodeNote,
  registerWorkflowDefinition,
  type CaseSnapshot,
  type NodeState,
  type WorkflowNode,
} from "@/lib/workflow";
import { LanguageSwitcher } from "../language-switcher";
import type { CitizenOutcome } from "@/lib/citizen-outcomes";
import type { TrustMetadata, WorkflowJurisdiction } from "@/lib/trust";
import { TrustDisclosure } from "../trust-disclosure";
import { ArtifactDraftPanel } from "./artifact-draft-panel";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--line)] pt-5">
      <h2 className="m-0 text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function StepRow({
  node,
  locale,
  note,
}: {
  node: WorkflowNode;
  locale: Locale;
  note?: string;
}) {
  const title = translate(node.title, locale);
  const detail = translate(node.detail, locale);

  return (
    <li className="border-l-[3px] border-[var(--marigold)] py-2 pl-4">
      <strong className="block text-sm">{title}</strong>
      {detail !== title && <span className="mt-1 block text-sm leading-relaxed text-[#536059]">{detail}</span>}
      {node.link && (
        <a className="mt-1 block break-all text-sm font-bold text-[var(--green)]" href={node.link.url} target="_blank" rel="noopener noreferrer">
          {node.link.url}
        </a>
      )}
      {note && <em className="mt-1 block text-sm font-bold not-italic text-[#7c2b21]">{note}</em>}
    </li>
  );
}

export default function CaseCardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = use(searchParams);
  const t = useTranslations("pages");
  const locale = useLocale() as Locale;

  const [outcomes, setOutcomes] = useState<CitizenOutcome[]>([]);
  const [ownedSnapshot, setOwnedSnapshot] = useState<CaseSnapshot | null>(null);
  const [caseLoadFailed, setCaseLoadFailed] = useState(false);
  const [outcomesLoadFailed, setOutcomesLoadFailed] = useState(false);
  const [ownedTrust, setOwnedTrust] = useState<TrustMetadata | null>(null);
  const [ownedJurisdiction, setOwnedJurisdiction] = useState<WorkflowJurisdiction | null>(null);
  const caseIdParam = firstValue(params.caseId);

  useEffect(() => {
    if (!caseIdParam) return;
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(caseIdParam)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "case unavailable");
        return result;
      })
      .then(({ case: savedCase, definition, trust, jurisdiction }) => {
        if (cancelled || !savedCase?.snapshot || !definition || !trust || !jurisdiction) return;
        registerWorkflowDefinition(definition, savedCase.snapshot.workflowVersionId);
        setOwnedSnapshot(savedCase.snapshot);
        setOwnedTrust(trust);
        setOwnedJurisdiction(jurisdiction);
      })
      .catch(() => {
        if (!cancelled) setCaseLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [caseIdParam]);

  useEffect(() => {
    if (!caseIdParam || !ownedSnapshot) return;
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(caseIdParam)}/outcomes`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "outcomes unavailable");
        return result;
      })
      .then(({ outcomes: list }) => {
        if (!cancelled && Array.isArray(list)) setOutcomes(list);
      })
      .catch(() => {
        if (!cancelled) setOutcomesLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [caseIdParam, ownedSnapshot]);

  if (!caseIdParam) {
    return <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6"><a className="inline-flex min-h-11 items-center rounded-xl bg-[#eee5d8] px-4 text-sm font-extrabold text-[var(--green)] no-underline" href="/">{t("caseCard.back")}</a></main>;
  }

  if (!ownedSnapshot && !caseLoadFailed) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
        <p role="status">{t("caseCard.loading")}</p>
      </main>
    );
  }

  if (caseLoadFailed) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
        <a className="inline-flex min-h-11 items-center rounded-xl bg-[#eee5d8] px-4 text-sm font-extrabold text-[var(--green)] no-underline" href="/">{t("caseCard.back")}</a>
        <p className="mt-4 rounded-xl border border-[#d9a79f] bg-[#fbeceb] p-4 font-bold text-[#7c2b21]" role="alert">{t("caseCard.unreadable")}</p>
      </main>
    );
  }

  const snapshot = ownedSnapshot;
  if (!snapshot) return null;

  const seed = getCaseWorkflowDefinition(snapshot);
  if (!seed) return null;
  const stateById = new Map(snapshot.nodes.map((entry) => [entry.id, entry.state]));
  const steps = seed.nodes.map((node) => ({
    node,
    state: stateById.get(node.id) ?? ("pending" as NodeState),
  }));

  const done = steps.filter((step) => step.state === "done");
  const current = steps.find((step) => step.state === "needs-you");
  const verifying = steps.filter((step) => step.state === "verifying");
  const active = current ?? verifying[0];
  const blocked = steps.filter((step) => step.state === "blocked");
  // A blocker the recovery step already closed: proof the case survived it.
  const cleared = steps.filter((step) => isClearedBlocker(snapshot, step.node.id));
  const complete = steps.every((step) => step.state === "done" || step.state === "pending")
    && steps.some((step) => step.node.type === "case-complete" && step.state === "done");
  const currentVisit = active?.node.visit;
  const referenceNumbers = (snapshot.reports ?? []).flatMap(({ referenceNumber }) => referenceNumber ? [referenceNumber] : []);
  const grievanceNeedsPreparation = snapshot.artifacts.includes("escalation-draft")
    && !snapshot.artifactDrafts?.["escalation-draft"];
  const ui = locale === "hi" ? {
    status: "केस की स्थिति",
    next: "अगला काम",
    progress: "प्रगति",
    documents: "दस्तावेज़",
    continue: "इस काम को जारी रखें",
    preparing: "तैयारी",
    history: "पूरा इतिहास और प्रमाण देखें",
    historyHint: "पूरे हुए कदम, रुकावटें, दर्ज जवाब और नतीजे",
    responses: "पोर्टल और डेस्क के जवाब",
    outcomes: "नतीजे",
    references: "संदर्भ संख्याएँ",
    noReferences: "अभी कोई संदर्भ संख्या दर्ज नहीं है",
    available: "तैयार दस्तावेज़",
    noDocuments: "अभी कोई दस्तावेज़ तैयार नहीं है। यात्रा जारी रखने पर दस्तावेज़ यहाँ दिखाई देंगे।",
    download: "Word दस्तावेज़ डाउनलोड करें",
    prepareGrievance: "अपनी शिकायत तैयार करें",
    prepareGrievanceDetail: "अपने दर्ज केस विवरण से AI मसौदा बनाएँ, फिर उसे पढ़कर सुधारें और डाउनलोड करें।",
    prepareGrievanceAction: "शिकायत तैयार करें",
  } : {
    status: "Case status",
    next: "Next action",
    progress: "Progress",
    documents: "Documents",
    continue: "Continue this action",
    preparing: "Prepare before you go",
    history: "View full history and evidence",
    historyHint: "Completed steps, setbacks, recorded responses and outcomes",
    responses: "Portal and desk responses",
    outcomes: "Outcomes",
    references: "Reference numbers",
    noReferences: "No reference number recorded yet",
    available: "Available documents",
    noDocuments: "No documents are ready yet. They will appear here as you continue the journey.",
    download: "Download Word document",
    prepareGrievance: "Prepare your grievance",
    prepareGrievanceDetail: "Use your recorded case details to create an AI draft, then review, edit and download it.",
    prepareGrievanceAction: "Prepare grievance",
  };
  const outcomeLabels = locale === "hi" ? {
    awareness: "यात्रा शुरू हुई",
    worked: "बताए अनुसार हुआ",
    different: "कुछ अलग हुआ",
    stuck: "नागरिक अटक गया/गई",
    skipped: "प्रतिक्रिया छोड़ी गई",
    resolved: "समस्या हल होने की पुष्टि",
  } : {
    awareness: "Journey started",
    worked: "Worked as shown",
    different: "Something was different",
    stuck: "Citizen got stuck",
    skipped: "Feedback skipped",
    resolved: "Resolution confirmed",
  };
  const formatTime = (value: string) => new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  /** A blocked or cleared node's reason, always read from the bundled seed. */
  const noteFor = (nodeId: string): string | undefined => {
    const note = nodeNote(snapshot, nodeId);
    return note && translate(note, locale);
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <a className="inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] bg-[#eee5d8] px-4 text-sm font-extrabold text-[var(--green)] no-underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)]" href={`/?caseId=${encodeURIComponent(caseIdParam)}`}>
          {t("caseCard.continue")}
        </a>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LanguageSwitcher />
          <button className="min-h-11 rounded-xl border-0 bg-[var(--marigold)] px-4 text-sm font-extrabold text-[#2f250f] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)]" type="button" onClick={() => window.print()}>
            {t("caseCard.print")}
          </button>
        </div>
      </div>

      <article className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[#fffdf9] shadow-[0_14px_40px_rgba(52,43,27,0.07)] print:border-0 print:shadow-none">
        <header className="border-b border-[var(--line)] px-5 py-6 sm:px-7">
          <p className="m-0 text-[.7rem] font-extrabold uppercase tracking-[.14em] text-[var(--green)]">{t("caseCard.eyebrow")}</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="m-0 text-2xl font-extrabold leading-tight">{translate(seed.title, locale)}</h1>
              <p className="mt-1 text-sm leading-relaxed text-[#536059]">{translate(seed.subtitle, locale)}</p>
            </div>
            {isSyntheticSeed(snapshot.workflowId) && <p className="m-0 w-fit rounded-full bg-[#fff1cf] px-3 py-1 text-xs font-extrabold text-[#79540d]">{locale === "hi" ? "कृत्रिम उदाहरण यात्रा और रिकॉर्ड" : "Synthetic example journey and records"}</p>}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-[#f2f5f2] p-3"><dt className="text-[.68rem] font-extrabold uppercase tracking-wide text-[#627069]">{ui.status}</dt><dd className="mt-1 text-sm font-extrabold text-[var(--ink)]">{complete ? t("caseCard.status.complete") : t("caseCard.status.inProgress")}</dd></div>
            <div className="rounded-xl bg-[#f2f5f2] p-3"><dt className="text-[.68rem] font-extrabold uppercase tracking-wide text-[#627069]">{ui.progress}</dt><dd className="mt-1 text-sm font-extrabold text-[var(--ink)]">{done.length} / {steps.length}</dd></div>
            <div className="col-span-2 rounded-xl bg-[#f2f5f2] p-3 sm:col-span-1"><dt className="text-[.68rem] font-extrabold uppercase tracking-wide text-[#627069]">{ui.documents}</dt><dd className="mt-1 text-sm font-extrabold text-[var(--ink)]">{snapshot.artifacts.length}</dd></div>
          </dl>
          <div className="mt-3">{ownedTrust && ownedJurisdiction && <TrustDisclosure trust={ownedTrust} jurisdiction={ownedJurisdiction} locale={locale} />}</div>
        </header>

        <div className="grid gap-7 px-5 py-6 sm:px-7">
          <section aria-labelledby="next-action-title">
            <p className="m-0 text-[.7rem] font-extrabold uppercase tracking-[.14em] text-[var(--green)]">{ui.next}</p>
            {grievanceNeedsPreparation ? <div className="mt-2 rounded-2xl border-l-4 border-[var(--green)] bg-[#eef5f0] p-4 sm:p-5">
              <h2 className="m-0 text-xl font-extrabold" id="next-action-title">{ui.prepareGrievance}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#45534c]">{ui.prepareGrievanceDetail}</p>
              <a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--green)] px-4 text-sm font-extrabold text-white no-underline print:hidden" href="#artifact-escalation-draft">{ui.prepareGrievanceAction} →</a>
            </div> : active ? <div className="mt-2 rounded-2xl border-l-4 border-[var(--green)] bg-[#eef5f0] p-4 sm:p-5">
              <h2 className="m-0 text-xl font-extrabold" id="next-action-title">{translate(active.node.title, locale)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#45534c]">{translate(active.node.detail, locale)}</p>
              <p className="mt-2 text-sm font-extrabold text-[#7c2b21]">{active.state === "verifying" ? t("caseCard.current.verifying") : translate(active.node.ask, locale)}</p>
              <a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--green)] px-4 text-sm font-extrabold text-white no-underline print:hidden" href={`/?caseId=${encodeURIComponent(caseIdParam)}`}>{ui.continue} →</a>
            </div> : <p className="mt-2 text-sm text-[#536059]">{t("caseCard.current.empty")}</p>}
          </section>

          {currentVisit && <section className="rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5" aria-labelledby="visit-title">
            <p className="m-0 text-[.7rem] font-extrabold uppercase tracking-[.14em] text-[var(--green)]">{ui.preparing}</p>
            <h2 className="mt-1 text-lg font-extrabold" id="visit-title">{translate(currentVisit.office, locale)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#536059]">{translate(currentVisit.why, locale)}</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div><dt className="text-xs font-extrabold uppercase tracking-wide text-[var(--green)]">{t("caseCard.visits.carry")}</dt><dd className="mt-1 leading-relaxed">{tList(currentVisit.carry, locale).join(" · ")}</dd></div>
              <div><dt className="text-xs font-extrabold uppercase tracking-wide text-[var(--green)]">{t("caseCard.visits.script")}</dt><dd className="mt-1 rounded-xl bg-[#fff8e8] p-3 font-bold leading-relaxed">“{translate(currentVisit.script, locale)}”</dd></div>
              <div className="grid grid-cols-2 gap-3"><div><dt className="text-xs font-extrabold uppercase tracking-wide text-[var(--green)]">{t("caseCard.visits.expect")}</dt><dd className="mt-1">{translate(currentVisit.expect, locale)}</dd></div><div><dt className="text-xs font-extrabold uppercase tracking-wide text-[var(--green)]">{t("caseCard.visits.collect")}</dt><dd className="mt-1">{translate(currentVisit.collect, locale)}</dd></div></div>
            </dl>
            <p className="mb-0 mt-4 text-xs font-bold text-[#735c37]">{t("caseCard.visits.noAgent")}</p>
          </section>}

        <Section title={ui.available}>
          {snapshot.artifacts.length > 0 ? (
            snapshot.artifacts.map((id) => {
              const artifact = artifactContent[id];

              return (
                <div key={id} id={`artifact-${id}`} className="mt-3 scroll-mt-4 rounded-2xl border border-[var(--line)] bg-white p-4 sm:p-5">
                  <h3 className="m-0 text-base font-extrabold">{translate(artifact.title, locale)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[#536059]">{translate(artifact.subtitle, locale)}</p>
                  {id === "escalation-draft" ? <ArtifactDraftPanel
                    caseId={caseIdParam}
                    initialDraft={snapshot.artifactDrafts?.[id]}
                    locale={locale}
                    onDraftChange={(draft) => setOwnedSnapshot((currentSnapshot) => currentSnapshot ? {
                      ...currentSnapshot,
                      artifactDrafts: { ...currentSnapshot.artifactDrafts, [id]: draft },
                    } : currentSnapshot)}
                  /> : <>
                    <ul className="mt-3 grid gap-1 pl-5 text-sm leading-relaxed">
                      {renderArtifactBody(id, snapshot, locale).map((line, index) => <li key={`${id}-${index}`}>{line}</li>)}
                    </ul>
                    <a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[var(--green)] px-4 text-sm font-extrabold text-white no-underline print:hidden" href={`/api/cases/${encodeURIComponent(caseIdParam)}/artifacts/${encodeURIComponent(id)}?locale=${locale}`}>{ui.download}</a>
                  </>}
                  <p className="mb-0 mt-3 text-xs font-bold text-[#7a530a]">{t("caseCard.artifacts.draftLabel")}</p>
                </div>
              );
            })
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-[#536059]">{ui.noDocuments}</p>
          )}
        </Section>

          <details className="rounded-2xl border border-[var(--line)] bg-white print:border-0">
            <summary className="cursor-pointer p-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--green)] sm:p-5 print:hidden">
              <span className="ml-2 inline-block align-middle"><strong className="block text-base">{ui.history}</strong><span className="mt-1 block text-sm text-[#536059]">{ui.historyHint}</span></span>
            </summary>
            <div className="grid gap-6 border-t border-[var(--line)] p-4 sm:p-5 print:!grid print:border-0">
              <div><h3 className="m-0 text-sm font-extrabold">{t("caseCard.completed.title")}</h3>{done.length > 0 ? <ol className="mt-2 grid gap-1 p-0">{done.map((step) => <StepRow key={step.node.id} node={step.node} locale={locale} />)}</ol> : <p className="mt-2 text-sm text-[#536059]">{t("caseCard.completed.empty")}</p>}</div>
              {blocked.length > 0 && <div><h3 className="m-0 text-sm font-extrabold">{t("caseCard.blocked.title")}</h3><ol className="mt-2 grid gap-1 p-0">{blocked.map((step) => <StepRow key={step.node.id} node={step.node} locale={locale} note={noteFor(step.node.id)} />)}</ol></div>}
              {cleared.length > 0 && <div><h3 className="m-0 text-sm font-extrabold">{t("caseCard.cleared.title")}</h3><ol className="mt-2 grid gap-1 p-0">{cleared.map((step) => <StepRow key={step.node.id} node={step.node} locale={locale} note={noteFor(step.node.id)} />)}</ol></div>}
              <div><h3 className="m-0 text-sm font-extrabold">{ui.responses}</h3>{(snapshot.reports ?? []).length > 0 ? <ol className="mt-2 grid gap-2 p-0">{(snapshot.reports ?? []).map((report, index) => { const step = seed.nodes.find(({ id }) => id === report.stepId); return <li className="border-l-[3px] border-[var(--marigold)] py-2 pl-4 text-sm" key={`${report.recordedAt}-${index}`}><strong className="block">{step ? translate(step.title, locale) : report.stepId}</strong><span className="mt-1 block text-[#536059]">{locale === "hi" ? `जवाब की तारीख: ${report.responseDate}` : `Response date: ${report.responseDate}`}</span><span className="mt-1 block">{report.response}</span>{report.referenceNumber && <span className="mt-1 block">{locale === "hi" ? "संदर्भ" : "Reference"}: {report.referenceNumber}</span>}{report.evidence && <em className="mt-1 block font-bold not-italic text-[#7c2b21]">{locale === "hi" ? "प्रमाण का नोट" : "Evidence note"}: {report.evidence}</em>}</li>; })}</ol> : <p className="mt-2 text-sm text-[#536059]">{locale === "hi" ? "अभी कोई जवाब दर्ज नहीं है।" : "No portal or desk response has been recorded yet."}</p>}</div>
              <div><h3 className="m-0 text-sm font-extrabold">{ui.outcomes}</h3>{outcomesLoadFailed ? <p className="mt-2 rounded-xl bg-[#fbeceb] p-3 text-sm font-bold text-[#7c2b21]" role="alert">{locale === "hi" ? "नतीजे अभी उपलब्ध नहीं हैं। फिर से कोशिश करें।" : "Outcome evidence is unavailable. Please try again."}</p> : outcomes.length > 0 ? <ol className="mt-2 grid gap-2 p-0">{outcomes.map((outcome) => { const step = outcome.stepId ? seed.nodes.find(({ id }) => id === outcome.stepId) : undefined; return <li className="border-l-[3px] border-[var(--marigold)] py-2 pl-4 text-sm" key={outcome.id}><strong className="block">{outcomeLabels[outcome.kind]}</strong><span className="mt-1 block text-[#536059]">{formatTime(outcome.occurredAt)}</span>{step && <span className="mt-1 block">{translate(step.title, locale)}</span>}{outcome.detail && <em className="mt-1 block font-bold not-italic text-[#7c2b21]">{outcome.detail}</em>}</li>; })}</ol> : <p className="mt-2 text-sm text-[#536059]">{locale === "hi" ? "अभी कोई नतीजा दर्ज नहीं है।" : "No outcome evidence has been recorded yet."}</p>}</div>
              <div><h3 className="m-0 text-sm font-extrabold">{ui.references}</h3><p className="mt-2 text-sm text-[#536059]">{referenceNumbers.join(" · ") || ui.noReferences}</p></div>
            </div>
          </details>
        </div>
      </article>
    </main>
  );
}
