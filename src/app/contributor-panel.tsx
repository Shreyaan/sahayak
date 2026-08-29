"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useEffect, useState } from "react";
import type { ContributionDraft, ContributionStatus } from "@/lib/contribution";
import type { WorkflowStepSpec } from "@/lib/custom-workflow";
import { t as translate, tList, type Locale } from "@/lib/locale";

/** Message key for each status, so the badge reads in the active language. */
const statusKey: Record<ContributionStatus, string> = {
  draft: "status.draft",
  "needs review": "status.needsReview",
  "publishable draft": "status.publishableDraft",
};

type RecentSubmission = {
  id: number;
  createdAt: string;
  workflowId: string;
  title: string;
  status: string;
};

type StepDraft = { title: string; detail: string; kind: WorkflowStepSpec["kind"]; url: string };

const stepKinds: WorkflowStepSpec["kind"][] = ["confirm", "visit", "website", "desk"];

export function ContributorPanel({ onWorkflowAdded }: { onWorkflowAdded?: () => void }) {
  const text = useTranslations("citizen.contributor");
  const locale = useLocale() as Locale;
  const [tab, setTab] = useState<"experience" | "workflow">("experience");

  return (
    <section className="contributor-panel" aria-labelledby="contributor-heading">
      <p className="eyebrow" id="contributor-heading">{text("eyebrow")}</p>

      <div className="contribution-tabs" role="tablist" aria-label={text("eyebrow")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "experience"}
          className={tab === "experience" ? "active" : ""}
          onClick={() => setTab("experience")}
        >
          {text("tabs.experience")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "workflow"}
          className={tab === "workflow" ? "active" : ""}
          onClick={() => setTab("workflow")}
        >
          {text("tabs.workflow")}
        </button>
      </div>

      <h1 className="visually-hidden">
        {tab === "experience" ? text("tabs.experience") : text("tabs.workflow")}
      </h1>

      {tab === "experience"
        ? <ExperienceTab text={text} locale={locale} />
        : <WorkflowTab text={text} locale={locale} onWorkflowAdded={onWorkflowAdded} />}
    </section>
  );
}

function ExperienceTab({
  text,
  locale,
}: {
  text: ReturnType<typeof useTranslations>;
  locale: Locale;
}) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<ContributionDraft | null>(null);
  const [compiledInput, setCompiledInput] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [recent, setRecent] = useState<RecentSubmission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/submissions")
      .then((response) => response.json())
      .then((result) => Array.isArray(result.submissions) && setRecent(result.submissions))
      .catch(() => {});
  }, []);

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
    setSubmitState("idle");

    try {
      const response = await fetch("/api/contribute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || text("error"));
      setDraft(result);
      setCompiledInput(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("error"));
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!draft || !compiledInput || submitState === "busy") return;

    setSubmitState("busy");
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: compiledInput, draft }),
      });
      if (!response.ok) throw new Error();
      setSubmitState("done");

      const updated = await fetch("/api/submissions").then((r) => r.json());
      if (Array.isArray(updated.submissions)) setRecent(updated.submissions);
    } catch {
      setSubmitState("error");
    }
  }

  return (
    <>
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
          {submitState === "done"
            ? <p className="draft-meta submitted-note" role="status">{text("submitted")}</p>
            : (
              <button
                type="button"
                className="primary-action"
                disabled={submitState === "busy"}
                onClick={() => void submitForReview()}
              >
                {submitState === "busy" ? text("submitting") : text("submit")}
              </button>
            )}
          {submitState === "error" && (
            <p className="contribution-error" role="alert">{text("submitError")}</p>
          )}
        </section>
      )}

      {recent.length > 0 && (
        <section className="draft-section">
          <h3>{text("recent.heading")}</h3>
          <ul className="recent-submissions">
            {recent.map((submission) => (
              <li key={submission.id}>
                <strong>{submission.title || submission.workflowId}</strong>
                <small>
                  {new Date(submission.createdAt).toLocaleString()} · {submission.status}
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function WorkflowTab({
  text,
  locale,
  onWorkflowAdded,
}: {
  text: ReturnType<typeof useTranslations>;
  locale: Locale;
  onWorkflowAdded?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([
    { title: "", detail: "", kind: "confirm", url: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [error, setError] = useState("");

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  }

  const urlInvalid = steps.some(
    (step) => step.kind === "website" && !/^https:\/\/[^\s]+\.[^\s]+/.test(step.url.trim()),
  );

  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy || !title.trim() || !steps.some((step) => step.title.trim()) || urlInvalid) return;

    setBusy(true);
    setError("");
    setCreated(null);

    try {
      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
          steps: steps
            .filter((step) => step.title.trim())
            .map((step) => ({
              title: step.title.trim(),
              ...(step.detail.trim() ? { detail: step.detail.trim() } : {}),
              ...(step.kind === "website" && step.url.trim() ? { url: step.url.trim() } : {}),
              kind: step.kind,
            })),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || text("builder.error"));

      setCreated(translate(result.definition.title, locale));
      onWorkflowAdded?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text("builder.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="contributor-copy">{text("builder.copy")}</p>

      <form className="contribution-form" onSubmit={create}>
        <h2 className="builder-group">{text("builder.about")}</h2>
        <label htmlFor="workflow-title">{text("builder.titleLabel")}</label>
        <input
          id="workflow-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={text("builder.titlePlaceholder")}
          maxLength={120}
        />

        <label htmlFor="workflow-subtitle">{text("builder.subtitleLabel")}</label>
        <input
          id="workflow-subtitle"
          value={subtitle}
          onChange={(event) => setSubtitle(event.target.value)}
          placeholder={text("builder.subtitlePlaceholder")}
          maxLength={160}
        />

        <h2 className="builder-group">{text("builder.stepsHeading")}</h2>

        {steps.map((step, index) => (
          <fieldset key={index} className="builder-step">
            <legend>{text("builder.stepN", { n: index + 1 })}</legend>
            <input
              value={step.title}
              onChange={(event) => updateStep(index, { title: event.target.value })}
              placeholder={text("builder.stepTitle")}
              maxLength={160}
              aria-label={text("builder.stepTitle")}
            />
            <input
              value={step.detail}
              onChange={(event) => updateStep(index, { detail: event.target.value })}
              placeholder={text("builder.stepDetail")}
              maxLength={500}
              aria-label={text("builder.stepDetail")}
            />
            <div className="kind-picker" role="radiogroup" aria-label={text("builder.kind")}>
              {stepKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={step.kind === kind}
                  className={step.kind === kind ? "active" : ""}
                  onClick={() => updateStep(index, { kind })}
                >
                  {text(`builder.kinds.${kind}`)}
                </button>
              ))}
            </div>
            {step.kind === "website" && (
              <>
                <label htmlFor={`step-url-${index}`}>{text("builder.urlLabel")}</label>
                <input
                  id={`step-url-${index}`}
                  value={step.url}
                  onChange={(event) => updateStep(index, { url: event.target.value })}
                  placeholder={text("builder.urlPlaceholder")}
                  maxLength={500}
                  inputMode="url"
                  className={urlInvalid && !step.url.trim() ? "" : undefined}
                  aria-invalid={step.kind === "website" && step.url.trim() ? !/^https:\/\/[^\s]+\.[^\s]+/.test(step.url.trim()) : undefined}
                />
                {step.url.trim() && !/^https:\/\/[^\s]+\.[^\s]+/.test(step.url.trim()) && (
                  <p className="contribution-error" role="alert">{text("builder.urlInvalid")}</p>
                )}
              </>
            )}
            {steps.length > 1 && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setSteps((current) => current.filter((_, i) => i !== index))}
              >
                {text("builder.remove")}
              </button>
            )}
          </fieldset>
        ))}

        <div className="contribution-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={() => setSteps((current) => [...current, { title: "", detail: "", kind: "confirm", url: "" }])}
          >
            {text("builder.addStep")}
          </button>
          <button
            type="submit"
            className="primary-action"
            disabled={busy || !title.trim() || urlInvalid || !steps.some((step) => step.title.trim())}
          >
            {busy ? text("builder.creating") : text("builder.create")}
          </button>
        </div>
      </form>

      {created && (
        <p className="contribution-success" role="status">
          {text("builder.created", { title: created })}
        </p>
      )}
      {error && <p className="contribution-error" role="alert">{error}</p>}
    </>
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
