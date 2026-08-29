"use client";

import { FormEvent, useState } from "react";
import type { ContributionDraft } from "@/lib/contribution";

const example =
  "After my father died, I used Form 4 for a bank claim. The claimant name appeared as Shyam Sundar.";

export function ContributorPanel() {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<ContributionDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      if (!response.ok) throw new Error(result.error || "Could not compile the draft.");
      setDraft(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not compile the draft.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="contributor-panel" aria-labelledby="contributor-heading">
      <p className="eyebrow">Contributor mode</p>
      <h1 id="contributor-heading">Turn an experience into a reviewable draft.</h1>
      <p className="contributor-copy">
        Add a synthetic lived experience. It stays a draft and never becomes official guidance here.
      </p>

      <form className="contribution-form" onSubmit={compile}>
        <label htmlFor="contribution-input">What happened?</label>
        <textarea
          id="contribution-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Describe a synthetic bereavement claim experience…"
          rows={7}
        />
        <div className="contribution-actions">
          <button type="button" className="secondary-action" onClick={() => setInput(example)}>
            Fill example
          </button>
          <button type="submit" className="primary-action" disabled={busy || !input.trim()}>
            {busy ? "Compiling…" : "Compile draft"}
          </button>
        </div>
      </form>

      {error && <p className="contribution-error" role="alert">{error}</p>}

      {draft && (
        <section className="draft-card" aria-live="polite">
          <div className="draft-heading">
            <div>
              <p className="eyebrow">Synthetic contribution</p>
              <h2>{draft.title}</h2>
            </div>
            <span className="draft-status">{draft.status}</span>
          </div>

          <DraftList title="Steps" items={draft.steps} />
          <DraftList title="Matches" items={draft.matches} empty="No seed matches found yet." />
          <DraftList title="Possible additions" items={draft.additions} empty="No additions suggested." />

          <section className="draft-section">
            <h3>Conflicts requiring review</h3>
            {draft.conflicts.length ? (
              <ul>
                {draft.conflicts.map((conflict) => (
                  <li key={`${conflict.field}-${conflict.submitted}`}>
                    <strong>{conflict.field}:</strong> submitted “{conflict.submitted}”; bundled “{conflict.bundled}”. {conflict.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No conflicts found against the bundled seed.</p>
            )}
          </section>

          <p className="draft-meta">
            Source: {draft.sourceType} · Corroboration: {draft.corroborationCount}
          </p>
          <button type="button" className="simulated-publish" disabled>
            Simulated publish — review required
          </button>
        </section>
      )}

      <footer>Independent hackathon prototype. Not affiliated with any government body.</footer>
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
