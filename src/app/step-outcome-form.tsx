"use client";

import { FormEvent, useState } from "react";
import type { Locale } from "@/lib/locale";

type StepChoice = "worked" | "different" | "stuck" | "skipped";

const copy = {
  en: {
    heading: "Did this step match what happened?",
    choices: {
      worked: "Worked as shown",
      different: "Something was different",
      stuck: "I got stuck",
      skipped: "Skip",
    },
    detail: "What was different? (optional)",
    placeholder: "Do not include Aadhaar numbers, phone numbers, or email addresses.",
    save: "Save step feedback",
    saving: "Saving…",
    saved: "Feedback saved with this case and workflow version.",
    error: "Feedback could not be saved. Please try again.",
  },
  hi: {
    heading: "क्या यह कदम वैसे ही हुआ जैसा बताया गया था?",
    choices: {
      worked: "बताए अनुसार हुआ",
      different: "कुछ अलग हुआ",
      stuck: "मैं अटक गया/गई",
      skipped: "छोड़ें",
    },
    detail: "क्या अलग था? (वैकल्पिक)",
    placeholder: "आधार नंबर, फ़ोन नंबर या ईमेल पता न लिखें।",
    save: "कदम की जानकारी सहेजें",
    saving: "सहेज रहे हैं…",
    saved: "जानकारी इस केस और यात्रा संस्करण के साथ सहेजी गई।",
    error: "जानकारी सहेजी नहीं जा सकी। फिर कोशिश करें।",
  },
} as const;

export function StepOutcomeForm({ caseId, stepId, locale }: {
  caseId: string;
  stepId: string;
  locale: Locale;
}) {
  const text = copy[locale];
  const [choice, setChoice] = useState<StepChoice>();
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice) return;
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const body = {
        kind: choice,
        stepId,
        ...((choice === "different" || choice === "stuck") && detail.trim()
          ? { detail: detail.trim() }
          : {}),
      };
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("OUTCOME_FAILED");
      setMessage(text.saved);
    } catch {
      setError(text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="step-outcome" onSubmit={submit}>
      <strong>{text.heading}</strong>
      <div className="outcome-choices">
        {(Object.keys(text.choices) as StepChoice[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={choice === kind}
            onClick={() => setChoice(kind)}
          >
            {text.choices[kind]}
          </button>
        ))}
      </div>
      {(choice === "different" || choice === "stuck") && (
        <label>
          {text.detail}
          <textarea
            value={detail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder={text.placeholder}
            maxLength={500}
            rows={3}
          />
        </label>
      )}
      <button className="primary-action" type="submit" disabled={!choice || pending}>
        {pending ? text.saving : text.save}
      </button>
      {message ? <p className="outcome-success" role="status">{message}</p> : null}
      {error ? <p className="discovery-error" role="alert">{error}</p> : null}
    </form>
  );
}

const resolutionCopy = {
  en: {
    heading: "Was the problem resolved?",
    detail: "Resolution evidence (optional)",
    placeholder: "For example: payment date or acknowledgement reference.",
    submit: "Confirm resolved",
    pending: "Recording…",
    saved: "Resolution recorded separately from awareness.",
    error: "Resolution could not be recorded. Please try again.",
  },
  hi: {
    heading: "क्या समस्या हल हो गई?",
    detail: "समाधान का प्रमाण (वैकल्पिक)",
    placeholder: "जैसे: भुगतान की तारीख या पावती संदर्भ।",
    submit: "समाधान की पुष्टि करें",
    pending: "दर्ज कर रहे हैं…",
    saved: "समाधान जागरूकता से अलग दर्ज किया गया।",
    error: "समाधान दर्ज नहीं हो सका। फिर कोशिश करें।",
  },
} as const;

export function ResolutionOutcomeForm({ caseId, locale }: { caseId: string; locale: Locale }) {
  const text = resolutionCopy[locale];
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "resolved", ...(detail.trim() ? { detail: detail.trim() } : {}) }),
      });
      if (!response.ok) throw new Error("RESOLUTION_FAILED");
      setMessage(text.saved);
    } catch {
      setError(text.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="step-outcome resolution-outcome" onSubmit={submit}>
      <strong>{text.heading}</strong>
      <label>
        {text.detail}
        <textarea
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder={text.placeholder}
          maxLength={500}
          rows={3}
        />
      </label>
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? text.pending : text.submit}
      </button>
      {message ? <p className="outcome-success" role="status">{message}</p> : null}
      {error ? <p className="discovery-error" role="alert">{error}</p> : null}
    </form>
  );
}
