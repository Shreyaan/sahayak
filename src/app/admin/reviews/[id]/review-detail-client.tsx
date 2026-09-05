"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ReviewCaseDetail } from "@/lib/review-case-service";

type Wording = { title: { hi: string; en: string }; subtitle: { hi: string; en: string }; nodes: Array<{ id: string; title: { hi: string; en: string }; detail: { hi: string; en: string }; ask: { hi: string; en: string } }> };

function pairNeedsTranslation(pair: { hi: string; en: string }): boolean {
  return !pair.hi.trim() || !pair.en.trim() || pair.hi.trim().toLocaleLowerCase() === pair.en.trim().toLocaleLowerCase();
}

function hasMissingTranslation(wording: Wording): boolean {
  return pairNeedsTranslation(wording.title)
    || pairNeedsTranslation(wording.subtitle)
    || wording.nodes.some((node) => pairNeedsTranslation(node.title) || pairNeedsTranslation(node.detail) || pairNeedsTranslation(node.ask));
}

function wordingFor(review: ReviewCaseDetail): Wording {
  const definition = review.currentRevision.content.definition;
  return { title: definition.title, subtitle: definition.subtitle, nodes: definition.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })) };
}

async function requestReview(id: string): Promise<ReviewCaseDetail> {
  const response = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.code ?? "REVIEW_DATABASE_FAILED");
  return body.review;
}

async function mutateReview(id: string, body: unknown) {
  const response = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.code ?? "REVIEW_DATABASE_FAILED");
  return result.review;
}

async function translateMissing(id: string, expectedHash: string, wording: Wording): Promise<Wording> {
  const response = await fetch(`/api/admin/reviews/${encodeURIComponent(id)}/translate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedHash, wording }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? "AI translation is unavailable right now.");
  return result.wording;
}

export function ReviewDetailClient({ reviewId, initialReview }: { reviewId: string; initialReview: ReviewCaseDetail }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["review", reviewId], queryFn: () => requestReview(reviewId), initialData: initialReview });
  const review = query.data;
  const [wording, setWording] = useState(() => wordingFor(initialReview));
  useEffect(() => { if (review) setWording(wordingFor(review)); }, [review?.currentRevision.contentHash]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["review", reviewId] });
  const baseline = useMutation({ mutationFn: (baselineWorkflowVersionId: string | null) => mutateReview(reviewId, { action: "select-baseline", baselineWorkflowVersionId }), onSuccess: refresh });
  const save = useMutation({ mutationFn: () => mutateReview(reviewId, { action: "save-wording", expectedHash: review!.currentRevision.contentHash, wording }), onSuccess: refresh });
  const translation = useMutation({ mutationFn: () => translateMissing(reviewId, review!.currentRevision.contentHash, wording), onSuccess: setWording });
  if (!review) return <p role="alert">Review unavailable.</p>;
  const readOnly = review.status !== "draft";
  const failure = baseline.error ?? save.error ?? translation.error ?? query.error;
  const updateField = (nodeIndex: number | null, field: "title" | "subtitle" | "detail" | "ask", locale: "hi" | "en", value: string) => setWording((current) => {
    if (nodeIndex === null) return { ...current, [field]: { ...current[field as "title" | "subtitle"], [locale]: value } };
    return { ...current, nodes: current.nodes.map((node, index) => index === nodeIndex ? { ...node, [field]: { ...node[field as "title" | "detail" | "ask"], [locale]: value } } : node) };
  });
  const fieldClassName = "mt-2 min-h-12 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-base text-[var(--ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--marigold)] disabled:bg-[#f3efe7] disabled:text-[#69736e]";
  const labelClassName = "block text-sm font-extrabold text-[#425149]";

  return <article className="grid gap-6" aria-live="polite">
    <section className="rounded-[22px] border border-[var(--line)] bg-white/70 p-7 shadow-[0_14px_40px_rgba(52,43,27,0.07)] max-sm:p-5">
      <p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{review.status} · revision #{review.currentRevision.revision}</p>
      <h1 className="mt-3 max-w-4xl text-[clamp(2.25rem,5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.04em]">{review.currentRevision.content.definition.title.en}</h1>
      <p className="mt-3 text-lg text-[#425149]">{review.currentRevision.content.definition.title.hi}</p>
      <div className="mt-7 grid gap-4 border-t border-[var(--line)] pt-6 md:grid-cols-2">
        <div><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">Contributor title</p><p className="mt-2 leading-6 text-[#425149]">{review.submittedTitle ?? "Not provided"}</p></div>
        <div><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">Submitted evidence</p><p className="mt-2 leading-6 text-[#425149]">{review.evidence}</p></div>
      </div>
    </section>

    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-[20px] border border-[var(--line)] bg-white/60 p-6">
        <h2 className="text-xl font-extrabold">Compare with a published journey</h2>
        <label className={`${labelClassName} mt-5`}>Baseline<select className={fieldClassName} aria-label="Baseline" disabled={readOnly || baseline.isPending} value={review.baselineWorkflowVersionId ?? ""} onChange={(event) => baseline.mutate(event.target.value || null)}><option value="">No baseline</option>{review.similar.map((result) => <option key={result.workflowVersionId} value={result.workflowVersionId}>{result.title} · {result.jurisdiction.scope}</option>)}</select></label>
        {review.similar[0] && <p className="mt-3 rounded-xl bg-[#edf4ee] px-4 py-3 text-sm leading-6 text-[#425149]"><strong>Top suggestion:</strong> {review.similar[0].title}. {review.similar[0].matchReasons[0]}</p>}
        {review.baseline ? <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-[#425149]">{review.comparison.map((row) => <li key={`${row.proposedNodeId}-${row.baselineNodeId}`}><strong>{row.status}</strong> · {row.proposed?.title.en ?? row.baseline?.title.en}</li>)}</ol> : <p className="mt-4 text-sm leading-6 text-[#69736e]">Select a published baseline to compare steps.</p>}
      </section>
      <section className="rounded-[20px] border border-[var(--line)] bg-[#edf4ee] p-6">
        <p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">Review status</p>
        <h2 className="mt-2 text-xl font-extrabold">Pending expert review</h2>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm"><div><dt className="font-bold text-[#69736e]">Source</dt><dd className="mt-1 capitalize">{review.trustPreview.sourceType}</dd></div><div><dt className="font-bold text-[#69736e]">Jurisdiction</dt><dd className="mt-1 capitalize">{review.trustPreview.jurisdiction.scope}</dd></div><div><dt className="font-bold text-[#69736e]">Expert supports</dt><dd className="mt-1">{review.trustPreview.expertSupportCount}</dd></div><div><dt className="font-bold text-[#69736e]">Revision</dt><dd className="mt-1">#{review.currentRevision.revision}</dd></div></dl>
      </section>
    </div>

    <form className="rounded-[22px] border border-[var(--line)] bg-white/70 p-7 shadow-[0_14px_40px_rgba(52,43,27,0.07)] max-sm:p-5" onSubmit={(event) => { event.preventDefault(); if (!readOnly) save.mutate(); }}>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase tracking-[.1em] text-[var(--green)]">Proposed journey</p><h2 className="mt-1 text-2xl font-extrabold">Edit wording</h2><p className="mt-2 text-sm text-[#69736e]">Change the bilingual wording without changing the journey structure.</p></div><div className="flex flex-wrap gap-3">{hasMissingTranslation(wording) && <button className="min-h-12 rounded-xl border border-[var(--green)] bg-white px-5 font-extrabold text-[var(--green)] disabled:cursor-not-allowed disabled:opacity-50" disabled={readOnly || translation.isPending} onClick={() => translation.mutate()} type="button">{translation.isPending ? "Filling translations…" : "Fill missing translations with AI"}</button>}<button className="min-h-12 rounded-xl bg-[var(--marigold)] px-6 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-50" disabled={readOnly || save.isPending}>{save.isPending ? "Saving…" : "Save wording"}</button></div></div>
      {hasMissingTranslation(wording) && <p className="mt-4 text-sm font-semibold text-[#69736e]">AI fills the unsaved English or Hindi draft only. Review every translation before saving.</p>}

      <div className="mt-7 grid gap-5 md:grid-cols-2">
        {(["en", "hi"] as const).map((locale) => <label className={labelClassName} key={`title-${locale}`}>Journey title ({locale})<input className={fieldClassName} value={wording.title[locale]} disabled={readOnly} onChange={(event) => updateField(null, "title", locale, event.target.value)} /></label>)}
        {(["en", "hi"] as const).map((locale) => <label className={labelClassName} key={`subtitle-${locale}`}>Summary ({locale})<textarea className={`${fieldClassName} min-h-28 resize-y`} value={wording.subtitle[locale]} disabled={readOnly} onChange={(event) => updateField(null, "subtitle", locale, event.target.value)} /></label>)}
      </div>

      <div className="mt-8 grid gap-5">
        {wording.nodes.map((node, index) => <fieldset className="rounded-[18px] border border-[var(--line)] bg-[#fbf8f2] p-5" key={node.id}><legend className="px-2 text-sm font-extrabold text-[var(--green)]">Step {index + 1} · {node.id}</legend><div className="grid gap-5 md:grid-cols-2">{(["en", "hi"] as const).map((locale) => <label className={labelClassName} key={`${node.id}-title-${locale}`}>Title ({locale})<input className={fieldClassName} value={node.title[locale]} disabled={readOnly} onChange={(event) => updateField(index, "title", locale, event.target.value)} /></label>)}{(["en", "hi"] as const).map((locale) => <label className={labelClassName} key={`${node.id}-detail-${locale}`}>Instruction ({locale})<textarea className={`${fieldClassName} min-h-28 resize-y`} value={node.detail[locale]} disabled={readOnly} onChange={(event) => updateField(index, "detail", locale, event.target.value)} /></label>)}{(["en", "hi"] as const).map((locale) => <label className={labelClassName} key={`${node.id}-ask-${locale}`}>Citizen check-in ({locale})<input className={fieldClassName} value={node.ask[locale]} disabled={readOnly} onChange={(event) => updateField(index, "ask", locale, event.target.value)} /></label>)}</div></fieldset>)}
      </div>
    </form>
    {failure && <p className="rounded-xl bg-[#fbeceb] p-4 font-bold text-[#8b2e24]" role="alert">{failure.message === "STALE_REVISION" ? "This review changed. Reload it before saving." : failure.message}</p>}
  </article>;
}
