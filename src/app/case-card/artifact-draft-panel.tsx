"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  artifactInputDefinitions,
  type ArtifactDraft,
  type ScholarshipGrievanceFields,
} from "@/lib/artifact-drafts";
import { t, type Locale } from "@/lib/locale";

const emptyFields: ScholarshipGrievanceFields = {
  applicantName: "",
  applicationId: "",
  contact: "",
  bankAccountLastFour: "",
  destination: "",
};

const copy = {
  en: {
    heading: "Prepare your grievance",
    intro: "Fill the known details. The AI clerk will draft from these fields and your recorded case responses only.",
    privacy: "These details are saved with this browser-private case and sent to the configured AI provider for drafting. Do not enter an Aadhaar number or full bank account number.",
    required: "Required",
    generate: "Generate grievance with AI",
    generating: "Preparing draft…",
    review: "Review and edit before downloading",
    recipient: "To",
    subject: "Subject",
    body: "Grievance",
    request: "Requested action",
    enclosures: "Enclosures or evidence notes",
    save: "Save edits",
    saving: "Saving…",
    saved: "Saved to this private case.",
    download: "Download editable Word document",
  },
  hi: {
    heading: "अपनी शिकायत तैयार करें",
    intro: "ज्ञात विवरण भरें। AI क्लर्क केवल इन फ़ील्ड और आपके दर्ज केस जवाबों से मसौदा बनाएगा।",
    privacy: "ये विवरण इस ब्राउज़र-निजी केस में सुरक्षित होंगे और मसौदा बनाने के लिए कॉन्फ़िगर किए गए AI प्रदाता को भेजे जाएँगे। आधार संख्या या पूरा बैंक खाता नंबर दर्ज न करें।",
    required: "ज़रूरी",
    generate: "AI से शिकायत बनाएँ",
    generating: "मसौदा तैयार हो रहा है…",
    review: "डाउनलोड से पहले पढ़ें और सुधारें",
    recipient: "सेवा में",
    subject: "विषय",
    body: "शिकायत",
    request: "अनुरोधित कार्रवाई",
    enclosures: "संलग्नक या प्रमाण नोट",
    save: "बदलाव सुरक्षित करें",
    saving: "सुरक्षित हो रहा है…",
    saved: "इस निजी केस में सुरक्षित है।",
    download: "संपादन योग्य Word दस्तावेज़ डाउनलोड करें",
  },
} as const;

export function ArtifactDraftPanel({
  caseId,
  locale,
  initialDraft,
  onDraftChange,
}: {
  caseId: string;
  locale: Locale;
  initialDraft?: ArtifactDraft;
  onDraftChange: (draft: ArtifactDraft) => void;
}) {
  const text = copy[locale];
  const [fields, setFields] = useState<ScholarshipGrievanceFields>(initialDraft?.fields ?? emptyFields);
  const [draft, setDraft] = useState<ArtifactDraft | undefined>(initialDraft);
  const [busy, setBusy] = useState<"generate" | "save" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(initialDraft));

  const updateDocument = (key: keyof ArtifactDraft["document"]["en"], value: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      document: { ...draft.document, [locale]: { ...draft.document[locale], [key]: value } },
    });
    setSaved(false);
  };

  const generate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy("generate");
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/artifacts/escalation-draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fields),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The grievance could not be prepared.");
      setDraft(result.draft);
      setSaved(true);
      onDraftChange(result.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The grievance could not be prepared.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    setError("");
    try {
      const response = await fetch(`/api/cases/${encodeURIComponent(caseId)}/artifacts/escalation-draft`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: draft.document }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The edited draft was not saved.");
      setDraft(result.draft);
      setSaved(true);
      onDraftChange(result.draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The edited draft was not saved.");
    } finally {
      setBusy(null);
    }
  };

  return <div>
    <h4 className="m-0 text-lg font-extrabold">{text.heading}</h4>
    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#536059]">{text.intro}</p>
    <p className="mt-2 max-w-2xl text-xs font-bold leading-relaxed text-[#735c37]">{text.privacy}</p>

    <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={generate}>
      {artifactInputDefinitions["escalation-draft"].map((definition) => <Label className={definition.id === "destination" ? "grid gap-1.5 text-sm font-extrabold sm:col-span-2" : "grid gap-1.5 text-sm font-extrabold"} key={definition.id}>
        <span>{t(definition.label, locale)} {definition.required && <span className="text-[#8b2e24]">· {text.required}</span>}</span>
        <Input
          className="min-h-11 rounded-xl border-[var(--line)] bg-white px-3 text-base font-normal focus-visible:border-[var(--green)] focus-visible:ring-[var(--green)]/20"
          inputMode={definition.id === "bankAccountLastFour" ? "numeric" : undefined}
          maxLength={definition.id === "bankAccountLastFour" ? 4 : 200}
          pattern={definition.id === "bankAccountLastFour" ? "[0-9]{0,4}" : undefined}
          placeholder={t(definition.hint, locale)}
          required={definition.required}
          value={fields[definition.id]}
          onChange={(event) => {
            setFields({ ...fields, [definition.id]: event.target.value });
            setDraft(undefined);
            setSaved(false);
          }}
        />
      </Label>)}
      <Button className="min-h-11 bg-[var(--marigold)] px-5 font-extrabold text-[#2f250f] hover:bg-[#d9910f] sm:col-span-2 sm:justify-self-start" disabled={Boolean(busy)} type="submit">
        {busy === "generate" ? text.generating : text.generate}
      </Button>
    </form>

    {error && <p className="mt-4 font-bold text-[#8b2e24]" role="alert">{error}</p>}

    {draft && <div className="mt-7 border-t border-[var(--line)] pt-5">
      <h4 className="m-0 text-lg font-extrabold">{text.review}</h4>
      <div className="mt-4 grid gap-4">
        {([
          ["recipient", text.recipient, false],
          ["subject", text.subject, false],
          ["body", text.body, true],
          ["request", text.request, true],
          ["enclosures", text.enclosures, true],
        ] as const).map(([key, label, multiline]) => <Label className="grid gap-1.5 text-sm font-extrabold" key={key}>
          {label}
          {multiline ? <Textarea className="min-h-24 rounded-xl border-[var(--line)] bg-white p-3 text-base font-normal leading-relaxed focus-visible:border-[var(--green)] focus-visible:ring-[var(--green)]/20" maxLength={key === "body" ? 4_000 : 1_000} value={draft.document[locale][key]} onChange={(event) => updateDocument(key, event.target.value)} />
            : <Input className="min-h-11 rounded-xl border-[var(--line)] bg-white px-3 text-base font-normal focus-visible:border-[var(--green)] focus-visible:ring-[var(--green)]/20" maxLength={300} value={draft.document[locale][key]} onChange={(event) => updateDocument(key, event.target.value)} />}
        </Label>)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="min-h-11 bg-[#eee5d8] px-4 font-extrabold text-[var(--green)] hover:bg-[#e5dacb]" disabled={Boolean(busy) || saved} onClick={save} type="button">{busy === "save" ? text.saving : text.save}</Button>
        {saved ? <Button asChild className="min-h-11 bg-[var(--green)] px-4 font-extrabold text-white hover:bg-[#245a41]"><a href={`/api/cases/${encodeURIComponent(caseId)}/artifacts/escalation-draft?locale=${locale}`}>{text.download}</a></Button>
          : <span className="text-sm font-bold text-[#8b2e24]">{locale === "hi" ? "डाउनलोड से पहले बदलाव सुरक्षित करें।" : "Save changes before downloading."}</span>}
        {saved && <span className="text-sm text-[#536059]">{text.saved}</span>}
      </div>
    </div>}
  </div>;
}
