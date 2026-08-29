"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useState } from "react";
import type { ContributionDraft, ContributionStatus } from "@/lib/contribution";
import { t as translate, tList, type Locale } from "@/lib/locale";

/** Message key for each status, so the badge reads in the active language. */
const statusKey: Record<ContributionStatus, string> = {
  draft: "status.draft",
  "needs review": "status.needsReview",
  "publishable draft": "status.publishableDraft",
};

export function ContributorPanel() {
  const text = useTranslations("citizen.contributor");
  const locale = useLocale() as Locale;

  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<ContributionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const examples = [
    { label: text("examples.bereavementLabel"), text: text("examples.bereavementText") },
    { label: text("examples.scholarshipLabel"), text: text("examples.scholarshipText") },
  ];

  async function compile(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!value || busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || text("error"));
      setDraft(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contributor-panel" aria-labelledby="contributor-heading">
      <p className="eyebrow">{text("eyebrow")}</p>
      <h1 id="contributor-heading">{text("heading")}</h1>
      <p className="contributor-copy">{text("copy")}</p>

      <form className="contribution-form" onSubmit={compile}>
        <label htmlFor="contribution-input">{text("label")}</label>
        <textarea
          id="contribution-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={text("placeholder")}
          rows={7}
          maxLength={2_000}
        />
        <div className="contribution-actions">
          {examples.map((item) => (
            <button
              key={item.label}
              type="button"
              className="secondary-action"
              onClick={() => setInput(item.text)}
            >
              {item.label}
            </button>
          ))}
          <button type="submit" className="primary-action" disabled={busy || !input.trim()}>
            {busy ? text("compiling") : text("compile")}
          </button>
        </div>
      </form>

      {error && <p className="contribution-error" role="alert">{error}</p>}

      {draft && (
        <section className="draft-card" aria-live="polite">
          <div className="draft-heading">
            <div>
              <p className="eyebrow">{text("draftEyebrow")}</p>
              <h2>{translate(draft.title, locale)}</h2>
            </div>
            <span className="draft-status">{text(statusKey[draft.status])}</span>
          </div>

          <DraftList title={text("sections.steps")} items={tList(draft.steps, locale)} />
          <DraftList
            title={text("sections.matches")}
            items={tList(draft.matches, locale)}
            empty={text("sections.matchesEmpty")}
          />
          <DraftList
            title={text("sections.additions")}
            items={tList(draft.additions, locale)}
            empty={text("sections.additionsEmpty")}
          />

          <section className="draft-section">
            <h3>{text("sections.conflicts")}</h3>
            {draft.conflicts.length ? (
              <ul>
                {draft.conflicts.map((conflict) => (
                  <li key={conflict.submitted.en}>
                    <strong>{translate(conflict.field, locale)}:</strong>{" "}
                    {text("conflictComparison", {
                      submitted: translate(conflict.submitted, locale),
                      bundled: translate(conflict.bundled, locale),
                    })}{" "}
                    {translate(conflict.reason, locale)}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{text("sections.conflictsEmpty")}</p>
            )}
          </section>

          <p className="draft-meta">
            {text("meta", {
              source: text("sourceType"),
              count: draft.corroborationCount,
              workflow: draft.workflowId,
            })}
          </p>
          <p className="draft-meta">
            {draft.conflicts.length
              ? text("verdict.held")
              : draft.corroborationCount >= 2
                ? text("verdict.corroborated")
                : text("verdict.single")}
          </p>
          <button type="button" className="simulated-publish" disabled>
            {draft.status === "publishable draft" ? text("publish.publishable") : text("publish.review")}
          </button>
          <p className="draft-meta">{text("publishNote")}</p>
        </section>
      )}
    </section>
  );
}

function DraftList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return (
    <section className="draft-section">
      <h3>{title}</h3>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{empty}</p>}
    </section>
  );
}
