"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/locale";
import type { WorkflowNode } from "@/lib/workflow";

type DeskResponseInput = {
  optionId: string;
  response: string;
  responseDate: string;
  referenceNumber?: string;
  evidence?: string;
};

const copy = {
  en: {
    type: "What kind of response was it?",
    choose: "Choose what matches the response",
    response: "What did they tell you?",
    responsePlaceholder: "Write the portal message or the desk's words as accurately as you can.",
    date: "Response date",
    reference: "Reference number (optional)",
    referencePlaceholder: "Acknowledgement or complaint number",
    evidence: "Evidence note (optional)",
    evidencePlaceholder: "For example: screenshot saved, receipt collected",
    save: "Save response and continue",
    saving: "Saving response…",
  },
  hi: {
    type: "किस तरह का जवाब मिला?",
    choose: "मिले हुए जवाब से मेल खाता विकल्प चुनें",
    response: "उन्होंने क्या बताया?",
    responsePlaceholder: "पोर्टल का संदेश या डेस्क के शब्द जितना सही हो सके लिखें।",
    date: "जवाब की तारीख",
    reference: "संदर्भ संख्या (वैकल्पिक)",
    referencePlaceholder: "पावती या शिकायत संख्या",
    evidence: "प्रमाण का नोट (वैकल्पिक)",
    evidencePlaceholder: "जैसे: स्क्रीनशॉट सुरक्षित है, रसीद मिली",
    save: "जवाब सुरक्षित करके आगे बढ़ें",
    saving: "जवाब सुरक्षित हो रहा है…",
  },
} as const;

export function DeskResponseForm({
  node,
  locale,
  busy,
  onSubmit,
}: {
  node: WorkflowNode;
  locale: Locale;
  busy: boolean;
  onSubmit: (input: DeskResponseInput) => Promise<boolean>;
}) {
  const text = copy[locale];
  const [optionId, setOptionId] = useState("");
  const [response, setResponse] = useState("");
  const [responseDate, setResponseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [referenceNumber, setReferenceNumber] = useState("");
  const [evidence, setEvidence] = useState("");
  if (!node.report) return null;

  return <form className="mt-5 grid min-w-0 gap-4 border-t border-[var(--line)] pt-5" onSubmit={async (event) => {
    event.preventDefault();
    await onSubmit({
      optionId,
      response: response.trim(),
      responseDate,
      ...(referenceNumber.trim() ? { referenceNumber: referenceNumber.trim() } : {}),
      ...(evidence.trim() ? { evidence: evidence.trim() } : {}),
    });
  }}>
    <p className="m-0 text-sm font-extrabold text-[var(--green)]">{t(node.report.prompt, locale)}</p>

    <fieldset className="grid min-w-0 gap-2" disabled={busy}>
      <legend className="mb-2 text-sm font-extrabold">{text.type}</legend>
      {node.report.options.map((option) => <label key={option.id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] bg-white p-3 text-base leading-relaxed has-checked:border-[var(--green)] has-checked:bg-[#edf4ee] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--green)]">
        <input className="mt-1 size-4 shrink-0 accent-[var(--green)]" type="radio" name={`response-${node.id}`} required value={option.id} checked={optionId === option.id} onChange={() => setOptionId(option.id)} />
        <span className="min-w-0 break-words">{t(option.label, locale)}</span>
      </label>)}
    </fieldset>

    <label className="grid min-w-0 gap-1.5 text-sm font-extrabold">
      {text.response}
      <textarea className="min-h-24 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white p-3 text-base font-normal leading-relaxed" maxLength={2_000} placeholder={text.responsePlaceholder} required value={response} onChange={(event) => setResponse(event.target.value)} />
    </label>

    <div className="grid min-w-0 gap-4">
      <label className="grid min-w-0 gap-1.5 text-sm font-extrabold">
        {text.date}
        <input className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-base font-normal" required type="date" value={responseDate} onChange={(event) => setResponseDate(event.target.value)} />
      </label>
      <label className="grid min-w-0 gap-1.5 text-sm font-extrabold">
        {text.reference}
        <input className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-base font-normal" maxLength={160} placeholder={text.referencePlaceholder} value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} />
      </label>
    </div>

    <label className="grid min-w-0 gap-1.5 text-sm font-extrabold">
      {text.evidence}
      <input className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--line)] bg-white px-3 text-base font-normal" maxLength={1_000} placeholder={text.evidencePlaceholder} value={evidence} onChange={(event) => setEvidence(event.target.value)} />
    </label>

    <button className="min-h-11 justify-self-start rounded-xl bg-[var(--marigold)] px-5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full" disabled={busy || !optionId || !response.trim() || !responseDate} type="submit">
      {busy ? text.saving : text.save}
    </button>
  </form>;
}
