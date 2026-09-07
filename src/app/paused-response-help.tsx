"use client";

import { useState } from "react";
import type { CaseSnapshot, WorkflowDefinition } from "@/lib/workflow";
import type { Locale } from "@/lib/locale";
import type { Clarification } from "@/lib/clarification";

export function PausedResponseHelp({caseId, snapshot, definition, locale, onSaved, onRecord}: {
  caseId: string | null; snapshot: CaseSnapshot; definition: WorkflowDefinition; locale: Locale;
  onSaved: (snapshot: CaseSnapshot) => void; onRecord: () => void;
}) {
  const [result, setResult] = useState<Clarification>();
  const [answer, setAnswer] = useState("");
  const [note, setNote] = useState("");
  const [conversation, setConversation] = useState<Array<{role: "user" | "assistant"; content: string}>>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const hi = locale === "hi";
  const report = snapshot.reports!.at(-1)!;
  const saved = snapshot.clarificationNotes?.filter(note => note.reportRecordedAt === report.recordedAt) ?? [];
  const option = definition.nodes.find(node => node.id === report.stepId)?.report?.options.find(option => option.id === result?.supportedOptionId);

  async function request(save: boolean) {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    const message = save ? note : answer.trim() || (hi ? "मेरे दर्ज जवाब का मतलब और अगला सवाल समझाएँ।" : "Help me understand my recorded answer and what to clarify next.");
    try {
      const response = await fetch("/api/chat", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({
        action: save ? "save-clarification" : "help", caseId, caseSnapshot: snapshot, locale, message,
        conversation, ...(save ? {reportRecordedAt: report.recordedAt} : {}),
      })});
      const body = await response.json();
      if (!response.ok) throw new Error(body.code === "CASE_CONFLICT" ? "conflict" : "request");
      if (save) {
        onSaved(body.caseSnapshot);
        setStatus(hi ? "सवाल सुरक्षित है। यह सरकारी जवाब नहीं है।" : "Question saved. This is not a government response.");
      } else {
        setResult(body.clarification); setAiGenerated(body.aiGenerated);
        setNote(body.clarification.nextQuestion);
        setConversation(turns => [...turns, {role: "user" as const, content: message}, {role: "assistant" as const, content: body.reply}].slice(-8));
        setAnswer("");
      }
    } catch (error) {
      setError(error instanceof Error && error.message === "conflict"
        ? (hi ? "केस बदल गया। आपकी लिखी बात यहाँ है; कॉपी करके पेज दोबारा खोलें।" : "Your case changed. Your text is still here; copy it and reload before saving.")
        : (hi ? "काम पूरा नहीं हुआ। आपकी लिखी बात यहाँ है; फिर कोशिश करें।" : "That did not complete. Your text is still here; try again."));
    } finally { setBusy(false); }
  }

  return <section className="mt-5 border-t border-[var(--line)] pt-4" aria-label={hi ? "मिले जवाब को समझें" : "Understand this answer"}>
    {!result ? <>
      <p className="mb-3 text-sm text-[#536059]">{hi ? "मिले जवाब को समझें और आगे पूछने के लिए एक साफ़ सवाल तैयार करें। दोबारा दफ़्तर जाने की ज़रूरत मानकर न चलें।" : "Understand the answer and prepare one useful question. This does not mean you need another office visit."}</p>
      <button type="button" disabled={busy} onClick={() => void request(false)} className="min-h-11 rounded-xl bg-[var(--green)] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? (hi ? "समझ रहे हैं…" : "Understanding…") : (hi ? "इस जवाब का मतलब समझाएँ" : "Help me understand this answer")}</button>
    </> : <>
      <p className="text-xs text-[#536059]">{aiGenerated ? (hi ? "AI की व्याख्या · आधिकारिक पुष्टि नहीं" : "AI interpretation · not official confirmation") : (hi ? "AI उपलब्ध नहीं · सामान्य सवाल" : "AI unavailable · general question")}</p>
      <p className="mt-2 leading-relaxed">{result.explanation}</p>
      {result.question && <p className="mt-3 font-bold">{result.question}</p>}
      <form className="mt-3" onSubmit={event => {event.preventDefault(); void request(false);}}>
        <label className="block text-sm font-medium" htmlFor="clarification-answer">{hi ? "जो आप जानते हैं बताएँ (नहीं पता भी कह सकते हैं)" : "Tell us what you know (you can say you’re unsure)"}</label>
        <textarea id="clarification-answer" value={answer} onChange={event => setAnswer(event.target.value)} disabled={busy} maxLength={2000} rows={2} className="mt-2 w-full rounded-lg border border-[var(--line)] p-3" />
        <button disabled={busy || !answer.trim()} className="mt-2 min-h-11 rounded-lg border border-[var(--green)] px-4 font-semibold text-[var(--green)] disabled:opacity-50">{busy ? (hi ? "रुकें…" : "Please wait…") : (hi ? "जवाब समझाएँ" : "Clarify my answer")}</button>
      </form>
      {option && <aside className="mt-4 border-l-2 border-[var(--green)] pl-3 text-sm">
        <p>{hi ? "आपकी बात इस दर्ज विकल्प से मिल सकती है:" : "Your clarification may match this supported response:"} <strong>{option.label[locale]}</strong></p>
        <p className="mt-1">{hi ? "इसे तभी दर्ज करें जब यही असल में बताया गया था।" : "Record it only if this is what you were actually told."}</p>
        <button type="button" disabled={busy} onClick={onRecord} className="min-h-11 font-semibold text-[var(--green)] underline">{hi ? "असल जवाब दर्ज करें" : "Record the actual answer"}</button>
      </aside>}
      <label className="mt-5 block font-bold" htmlFor="clarification-note">{hi ? "आगे पूछने के लिए सवाल" : "A question to keep"}</label>
      <p className="mt-1 text-sm text-[#536059]">{hi ? "बदलकर सुरक्षित करें। यह न कोई निर्देश है, न जमा किया आवेदन।" : "Edit before saving. This is a question, not an instruction or a submitted request."}</p>
      <textarea id="clarification-note" value={note} onChange={event => setNote(event.target.value)} disabled={busy} maxLength={1500} rows={3} className="mt-2 w-full rounded-lg border border-[var(--line)] p-3" />
      <button type="button" disabled={busy || !caseId || !note.trim() || saved.some(entry => entry.text === note.trim())} onClick={() => void request(true)} className="mt-2 min-h-11 rounded-xl bg-[var(--green)] px-4 py-3 font-bold text-white disabled:opacity-50">{hi ? "सवाल केस में रखें" : "Keep question with my case"}</button>
    </>}
    {error && <p role="alert" className="mt-3 text-sm text-[#8b2e24]">{error}</p>}
    {status && <p role="status" className="mt-3 text-sm text-[var(--green)]">{status}</p>}
    {saved.length > 0 && <div className="mt-4 text-sm"><h3 className="font-bold">{hi ? "आपके सुरक्षित सवाल" : "Your saved questions"}</h3>{saved.map(entry => <p key={entry.savedAt} className="mt-2 whitespace-pre-wrap">{entry.text}<small className="block text-[#65716b]">{new Date(entry.savedAt).toLocaleString(hi ? "hi-IN" : "en-IN")}</small></p>)}<p className="mt-2">{hi ? "ये सवाल साथ ले जाने वाले नोट में भी हैं।" : "These questions are also in your take-along brief."}</p></div>}
  </section>;
}
