"use client";

import { type FormEvent, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ContributionDraft } from "@/lib/contribution";
import { t as translate, type Locale } from "@/lib/locale";
import { indiaDistricts, indiaStates, jurisdictionLabel } from "@/lib/india-locations";
import type { ReviewJurisdiction } from "@/lib/review-case";
import { McpCallout } from "./mcp-callout";

type Scope = "central" | "state" | "district";
type Preview = { draft: ContributionDraft; jurisdiction?: ReviewJurisdiction; jurisdictionReason?: { hi: string; en: string }; previewToken: string };

export function ContributorPanel() {
  const locale = useLocale() as Locale;
  const text = useTranslations("citizen.contributor");
  const [title, setTitle] = useState("");
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<Scope | "">("");
  const [stateCode, setStateCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [previewState, setPreviewState] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string>();

  const jurisdictionReady = !scope || scope === "central" || Boolean(stateCode) && (scope !== "district" || Boolean(districtCode));
  function clearPreview() { setPreviewState(null); setReviewUrl(undefined); }


  async function preview(event: FormEvent) {
    event.preventDefault();
    if (!input.trim() || busy || !jurisdictionReady) return;
    setBusy(true); setError(""); clearPreview();
    try {
      const jurisdiction = scope ? { scope, ...(scope !== "central" ? { stateCode } : {}), ...(scope === "district" ? { districtCode } : {}) } : undefined;
      const response = await fetch("/api/contribute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() || undefined, input, locale, jurisdiction }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.code === "UNSUPPORTED_CONTRIBUTION" ? text("review.unsupported") : text("error"));
      setPreviewState({ draft: result, jurisdiction: result.jurisdiction, jurisdictionReason: result.jurisdictionReason, previewToken: result.previewToken });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("error"));
    } finally { setBusy(false); }
  }

  async function confirm() {
    if (!previewState || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, previewToken: previewState.previewToken }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(text("submitError"));
      setReviewUrl(result.reviewUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("submitError"));
    } finally { setBusy(false); }
  }

  const fieldClassName = "mt-1 min-h-12 w-full rounded-xl border border-[#d9cfbf] bg-white px-3 py-3 text-base text-[#17231d] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#e69d18]";

  return <section className="pt-9" aria-labelledby="contributor-heading">
    <div className="max-w-3xl">
      <p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("eyebrow")}</p>
      <h1 id="contributor-heading" className="my-2 max-w-2xl text-[clamp(2.25rem,5vw,3.5rem)] font-black leading-[1.02] tracking-[-0.04em]">{text("heading")}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-[#536059]">{text("review.copy")}</p>
    </div>

    <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_310px]">
      <div className="min-w-0">
        <form className="grid gap-2 rounded-[22px] border border-[#d9cfbf] bg-white/70 p-7 shadow-[0_14px_40px_rgba(52,43,27,0.07)] max-sm:p-5" onSubmit={preview}>
          <label className="text-sm font-extrabold" htmlFor="contribution-title">{text("titleLabel")}</label>
          <input className={fieldClassName} id="contribution-title" value={title} onChange={(event) => { setTitle(event.target.value); clearPreview(); }} maxLength={120} placeholder={text("titlePlaceholder")} />
          <label className="mb-2 mt-5 text-xl font-extrabold" htmlFor="contribution-input">{text("label")}</label>
          <textarea className={`${fieldClassName} min-h-56 resize-y leading-6`} id="contribution-input" value={input} onChange={(event) => { setInput(event.target.value); clearPreview(); }} rows={8} maxLength={2_000} placeholder={text("placeholder")} required />

          <div className="mt-5 border-t border-[#d9cfbf] pt-5">
            <label className="text-sm font-extrabold" htmlFor="jurisdiction-scope">02 · {text("review.jurisdiction")}</label>
            <p className="mt-1 text-sm leading-6 text-[#536059]" id="jurisdiction-help">{text("review.jurisdictionHelp")}</p>
            <select aria-describedby="jurisdiction-help" className={fieldClassName} id="jurisdiction-scope" value={scope} onChange={(event) => { const next = event.target.value as Scope | ""; setScope(next); setStateCode(""); setDistrictCode(""); clearPreview(); }}>
              <option value="">{text("review.suggest")}</option><option value="central">{text("review.central")}</option><option value="state">{text("review.state")}</option><option value="district">{text("review.district")}</option>
            </select>
            {(scope === "state" || scope === "district") && <><label className="mt-4 block text-sm font-extrabold" htmlFor="state-code">{text("review.stateName")}</label><select className={fieldClassName} id="state-code" value={stateCode} onChange={(event) => { setStateCode(event.target.value); setDistrictCode(""); clearPreview(); }} required><option value="">{text("review.chooseState")}</option>{indiaStates.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></>}
            {scope === "district" && <><label className="mt-4 block text-sm font-extrabold" htmlFor="district-code">{text("review.districtName")}</label><select className={fieldClassName} id="district-code" value={districtCode} onChange={(event) => { setDistrictCode(event.target.value); clearPreview(); }} disabled={!stateCode} required><option value="">{text("review.chooseDistrict")}</option>{indiaDistricts(stateCode).map((district) => <option key={district} value={district}>{district}</option>)}</select></>}
          </div>
          <button type="submit" className="mt-5 min-h-12 justify-self-end rounded-xl bg-[var(--marigold)] px-6 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full" disabled={busy || !input.trim() || !jurisdictionReady}>{busy ? text("review.preparing") : text("review.preview")}</button>
        </form>

        {error && <p className="mt-4 font-bold text-[#8b2e24]" role="alert">{error}</p>}
        {previewState && <section className="mt-6 rounded-[22px] border border-[#d9cfbf] bg-white/70 p-6" aria-live="polite"><p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">{text("review.previewEyebrow")}</p><h2 className="mt-1 text-2xl font-bold">{translate(previewState.draft.title, locale)}</h2><p className="mt-2 leading-7 text-[#536059]">{translate(previewState.draft.summary, locale)}</p>{previewState.jurisdiction && <><h3 className="mt-6 font-extrabold">{text("review.jurisdiction")}</h3><p className="mt-1 text-[#536059]"><strong>{jurisdictionLabel(previewState.jurisdiction, locale)}</strong>{previewState.jurisdictionReason ? ` — ${translate(previewState.jurisdictionReason, locale)}` : ""}</p><p className="mt-1 text-sm text-[#536059]">{text("review.checkJurisdiction")}</p></>}<h3 className="mt-6 font-extrabold">{text("sections.steps")}</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-[#536059]">{previewState.draft.steps.map((step, index) => <li key={`${index}-${step.en}`}>{translate(step, locale)}</li>)}</ol><h3 className="mt-6 font-extrabold">{text("sections.additions")}</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-[#536059]">{previewState.draft.additions.map((item) => <li key={item.en}>{translate(item, locale)}</li>)}</ul><h3 className="mt-6 font-extrabold">{text("sections.conflicts")}</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-[#536059]">{previewState.draft.conflicts.map((item) => <li key={item.field.en}>{translate(item.field, locale)}: {translate(item.reason, locale)}</li>)}</ul>{reviewUrl ? <p className="mt-6 rounded-xl bg-[#edf4ee] p-4 font-bold text-[var(--green)]" role="status">{text("review.success")} <a className="underline" href={reviewUrl}>{text("review.openReview")}</a> — {text("review.signInRequired")}</p> : <button type="button" className="mt-6 min-h-12 rounded-xl bg-[var(--marigold)] px-6 font-extrabold text-[#2f250f] disabled:opacity-50" disabled={busy} onClick={() => void confirm()}>{busy ? text("submitting") : text("review.confirm")}</button>}</section>}
      </div>

      <aside className="lg:sticky lg:top-6">
        <McpCallout />
      </aside>
    </div>
  </section>;
}
