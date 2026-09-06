"use client";

import { useLocale, useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { t as translate, tList, type Locale } from "@/lib/locale";
import { stopMediaStream } from "@/lib/media";
import {
  getCaseWorkflowDefinition,
  isSyntheticSeed,
  nodeNote,
  registerWorkflowDefinition,
  type CaseSnapshot,
  type WorkflowDefinition,
} from "@/lib/workflow";
import { CitizenHome, type StoredCase } from "./citizen-home";
import { ContributorPanel } from "./contributor-panel";
import { DeskResponseForm } from "./desk-response-form";
import { LanguageSwitcher } from "./language-switcher";
import { JourneyArtifacts } from "./journey-artifacts";
import { ResolutionOutcomeForm, StepOutcomeForm } from "./step-outcome-form";

/** A saved Case Card is loaded through the browser-private case API. */
function caseCardHref(caseId: string): string {
  return `/case-card?caseId=${encodeURIComponent(caseId)}`;
}

/** A reply belongs to the step that produced it, never to a newly opened action. */
export function transitionFeedback(reply: string, actedStepId: string | undefined, snapshot: CaseSnapshot): string {
  const nextStepId = snapshot.nodes.find((node) => node.state === "needs-you" || node.state === "verifying")?.id;
  return actedStepId && nextStepId && actedStepId !== nextStepId ? "" : reply;
}

function VisitCard({ node, locale }: { node: WorkflowDefinition["nodes"][number]; locale: Locale }) {
  const text = useTranslations("citizen");
  if (!node.visit) return null;

  return (
    <div className="visit-card">
      <p className="eyebrow">{text("visit.eyebrow")}</p>
      <strong>{translate(node.visit.office, locale)}</strong>
      <p>{translate(node.visit.why, locale)}</p>
      <p className="visit-label">{text("visit.carry")}</p>
      <ul>{tList(node.visit.carry, locale).map((item) => <li key={item}>{item}</li>)}</ul>
      <p className="visit-label">{text("visit.script")}</p>
      <p className="visit-script">“{translate(node.visit.script, locale)}”</p>
      <p className="visit-label">{text("visit.expect")}</p>
      <p>{translate(node.visit.expect, locale)}</p>
      <p className="visit-label">{text("visit.collect")}</p>
      <p>{translate(node.visit.collect, locale)}</p>
      <p className="visit-warning">
        {text("visit.warning")}
        <em>{text("visit.warningNote")}</em>
      </p>
    </div>
  );
}

export function HomeContent() {
  const text = useTranslations("citizen");
  const common = useTranslations("common");
  const locale = useLocale() as Locale;
  const [activeCaseId, setActiveCaseId] = useQueryState("caseId", { history: "replace" });
  const requestError = text("error.request");

  const [contributorMode, setContributorMode] = useState(false);
  const [savedCases, setSavedCases] = useState<StoredCase[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [caseSnapshot, setCaseSnapshot] = useState<CaseSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reportStepId, setReportStepId] = useState<string>();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);
  const recordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRequest = useRef(0);

  function clearRecordingResources(updateState = true) {
    if (recordingTimeout.current) {
      clearTimeout(recordingTimeout.current);
      recordingTimeout.current = null;
    }

    stopMediaStream(mediaStream.current);
    mediaStream.current = null;
    recorder.current = null;
    if (updateState) setRecording(false);
  }

  function stopActiveRecording(discard: boolean, updateState = true) {
    recordingRequest.current += 1;
    const activeRecorder = recorder.current;
    if (discard && activeRecorder) activeRecorder.onstop = null;

    try {
      if (activeRecorder?.state === "recording") activeRecorder.stop();
    } finally {
      clearRecordingResources(updateState);
    }
  }

  useEffect(() => () => stopActiveRecording(true, false), []);

  async function refreshCases() {
    try {
      const response = await fetch("/api/cases");
      const result = await response.json();
      if (Array.isArray(result.cases)) setSavedCases(result.cases);
    } catch {
      setSavedCases([]);
    }
  }

  useEffect(() => {
    void refreshCases();
  }, []);

  useEffect(() => {
    if (!activeCaseId || activeCaseId === caseId) return;

    let cancelled = false;
    setFeedback("");
    fetch(`/api/cases/${encodeURIComponent(activeCaseId)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Case unavailable");
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        registerWorkflowDefinition(result.definition as WorkflowDefinition, result.case.snapshot.workflowVersionId);
        openCase(result.case.snapshot, result.case.id);
      })
      .catch(() => {
        if (!cancelled) setFeedback(requestError);
      });

    return () => { cancelled = true; };
  }, [activeCaseId, caseId, requestError, resumeAttempt]);

  /**
   * The server is the only authority for case transitions: whatever snapshot it
   * returns replaces local state. Nothing is decided on the client. The reply
   * arrives already written in the active language, and is shown as the latest
   * update under the current action.
   */
  async function ask(body: Record<string, unknown>): Promise<boolean> {
    if (busy || !caseSnapshot) return false;

    setBusy(true);
    const actedStepId = caseSnapshot.nodes.find((node) => node.state === "needs-you" || node.state === "verifying")?.id;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, locale, caseSnapshot, ...(caseId ? { caseId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");

      setCaseSnapshot(result.caseSnapshot);
      setFeedback(transitionFeedback(result.reply, actedStepId, result.caseSnapshot));
      const actedStep = actedStepId
        ? result.caseSnapshot.nodes.find((node: { id: string }) => node.id === actedStepId)
        : undefined;
      if (body.action === "record-desk-response" || actedStep?.state === "done") setReportStepId(actedStepId);
      return true;
    } catch {
      setFeedback(text("error.request"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function answerWithIntent(intent: "affirmative" | "negative") {
    return ask({ action: "reply", intent });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const value = answer.trim();
    if (!value) return;

    setAnswer("");
    void ask({ action: "reply", message: value });
  }

  /** Opens a case, whether it came from the server or locally. */
  function openCase(caseSnapshot: CaseSnapshot, id: string | null) {
    setCaseId(id);
    setCaseSnapshot(caseSnapshot);
    setAnswer("");
    setFeedback("");
    setReportStepId(undefined);
    window.scrollTo({ top: 0 });
  }

  function resumeCase(id: string) {
    setFeedback("");
    if (id === activeCaseId) {
      setResumeAttempt((attempt) => attempt + 1);
    } else {
      void setActiveCaseId(id);
    }
  }

  async function startJourney(workflowVersionId: string) {
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowVersionId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      registerWorkflowDefinition(result.definition as WorkflowDefinition, result.caseSnapshot.workflowVersionId);
      openCase(result.caseSnapshot, result.caseId);
      await setActiveCaseId(result.caseId);
    } catch {
      setFeedback(text("error.request"));
    }
  }

  function resetDemo() {
    stopActiveRecording(true);
    setCaseSnapshot(null);
    setCaseId(null);
    void setActiveCaseId(null);
    setFeedback("");
    setReportStepId(undefined);
    setAnswer("");
    void refreshCases();
  }

  async function toggleRecording() {
    if (recorder.current?.state === "recording") {
      stopActiveRecording(false);
      return;
    }

    try {
      const requestId = recordingRequest.current + 1;
      recordingRequest.current = requestId;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingRequest.current !== requestId) {
        stopMediaStream(stream);
        return;
      }
      mediaStream.current = stream;
      const chunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream);
      recorder.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
      mediaRecorder.onstop = async () => {
        clearRecordingResources();
        const form = new FormData();
        form.append("audio", new File(chunks, "voice.webm", { type: mediaRecorder.mimeType }));
        // The speech model needs to know which language it is listening to.
        form.append("locale", locale);

        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setAnswer(result.transcript);
        } catch {
          setFeedback(text("error.transcribe"));
        }
      };
      mediaRecorder.onerror = () => {
        stopActiveRecording(true);
        setFeedback(text("error.recording"));
      };
      mediaRecorder.start();
      setRecording(true);
      recordingTimeout.current = setTimeout(() => stopActiveRecording(false), 30_000);
    } catch {
      stopActiveRecording(true);
      setFeedback(text("error.microphone"));
    }
  }

  async function speak(spoken: string) {
    let url: string | undefined;

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: spoken, locale }),
      });
      if (!response.ok) throw new Error("Speech request failed");

      url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Speech playback failed"));
        audio.play().catch(reject);
      });
    } catch {
      setFeedback(text("error.speech"));
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  function toggleContributorMode() {
    if (!contributorMode) stopActiveRecording(true);
    setContributorMode((current) => !current);
  }

  const workflow = caseSnapshot && getCaseWorkflowDefinition(caseSnapshot);
  const openNode = caseSnapshot?.nodes.find((node) => node.state === "needs-you");
  const current = workflow && openNode ? workflow.nodes.find((node) => node.id === openNode.id) : undefined;
  const waiting = caseSnapshot?.nodes.some((node) => node.state === "verifying") ?? false;
  const resolved = caseSnapshot?.nodes.some((node) => node.id === "case-done" && node.state === "done") ?? false;
  const confirmText = current
    ? (current.confirmLabel ? translate(current.confirmLabel, locale) : text("action.yesDefault"))
    : "";
  const declineText = current
    ? (current.declineLabel ? translate(current.declineLabel, locale) : text("action.noDefault"))
    : "";

  // Speech must never repeat itself: skip the title and detail when the
  // question already carries them.
  const actionTitle = current ? translate(current.title, locale) : "";
  const actionDetail = current ? translate(current.detail, locale) : "";
  const actionAsk = current ? translate(current.ask, locale) : "";
  const showDetail = Boolean(current) && actionDetail !== actionTitle;
  const spokenAction = current
    ? [
        actionAsk.includes(actionTitle) ? null : actionTitle,
        !showDetail || actionAsk.includes(actionDetail) ? null : actionDetail,
        actionAsk,
      ].filter(Boolean).join(". ")
    : "";

  return (
    <main className={!caseSnapshot ? "!w-full max-w-[1180px]" : undefined}>
      <header>
        <div className="brand">{common("brand")}</div>
        <div className="header-actions">
          <LanguageSwitcher />
          <button
            className="author-link"
            type="button"
            aria-pressed={contributorMode}
            onClick={toggleContributorMode}
          >
            {contributorMode ? text("mode.citizen") : text("mode.contribute")}
          </button>
        </div>
      </header>

      {contributorMode ? (
        <ContributorPanel />
      ) : !caseSnapshot || !workflow ? (
        <CitizenHome locale={locale} savedCases={savedCases} feedback={feedback} onStart={startJourney} onResume={resumeCase} />
      ) : (
        <>
          <section className="case-card">
            <div className="case-heading">
              <div>
                <p className="eyebrow">{text("case.eyebrow")}</p>
                <h2>{translate(workflow.title, locale)}</h2>
                <p className="case-subtitle">{translate(workflow.subtitle, locale)}</p>
              </div>
            </div>

            {isSyntheticSeed(caseSnapshot.workflowId) && <p className="mt-4 w-fit rounded-full bg-[#fff1cf] px-3 py-1 text-xs font-extrabold text-[#79540d]">{locale === "hi" ? "कृत्रिम उदाहरण यात्रा और रिकॉर्ड" : "Synthetic example journey and records"}</p>}

            <section className="action-panel" aria-live="polite">
              {current ? (
                <>
                  <p className="eyebrow">{text("action.eyebrow")}</p>
                  <h2>{actionTitle}</h2>
                  {showDetail && <p className="action-detail">{actionDetail}</p>}
                  <p className="action-question">{actionAsk}</p>
                  {current.link && (
                    <p className="action-link">
                      <a href={current.link.url} target="_blank" rel="noopener noreferrer">
                        🔗 {text("web.open")}
                      </a>
                      <small>{translate(current.link.collect, locale)}</small>
                    </p>
                  )}
                  <VisitCard node={current} locale={locale} />
                  {current.report ? <DeskResponseForm
                    busy={busy}
                    key={current.id}
                    locale={locale}
                    node={current}
                    onSubmit={(deskResponse) => ask({ action: "record-desk-response", deskResponse })}
                  /> : <div className="action-buttons">
                    <button
                      className="primary-action"
                      type="button"
                      disabled={busy}
                      onClick={() => void answerWithIntent("affirmative")}
                    >
                      {confirmText}
                    </button>
                    {current.onDecline && (
                      <button
                        className="secondary-action"
                        type="button"
                        disabled={busy}
                        onClick={() => void answerWithIntent("negative")}
                      >
                        {declineText}
                      </button>
                    )}
                    <button
                      className="listen-link"
                      type="button"
                      disabled={busy}
                      onClick={() => void speak(spokenAction)}
                      aria-label={text("action.listenLabel")}
                    >
                      🔊 {text("action.listen")}
                    </button>
                  </div>}
                </>
              ) : waiting ? (
                <p className="waiting" role="status">
                  <span className="waiting-dot" />
                  {text("case.waiting")}
                  <em>{text("case.waitingNote")}</em>
                </p>
              ) : (
                <p className="action-done">{text("case.allDone")}</p>
              )}

              {feedback && (
                <p className="feedback" role="status">
                  {feedback}
                  <button
                    className="listen-link"
                    type="button"
                    onClick={() => void speak(feedback)}
                    aria-label={text("action.listenLabel")}
                  >
                    🔊
                  </button>
                </p>
              )}

              {caseId && reportStepId && !current?.report && (
                <StepOutcomeForm caseId={caseId} stepId={reportStepId} locale={locale} />
              )}

              {caseId && resolved && (
                <ResolutionOutcomeForm caseId={caseId} locale={locale} />
              )}
            </section>

            <p className="eyebrow timeline-heading">{text("case.history")}</p>
            <ol className="timeline">
              {caseSnapshot.nodes.map((node) => {
                const definition = workflow.nodes.find((candidate) => candidate.id === node.id);
                if (!definition) return null;
                const note = nodeNote(caseSnapshot, node.id);

                return (
                  <li key={node.id} className={node.state}>
                    <span className="dot" />
                    <details>
                      <summary>
                        <strong>{translate(definition.title, locale)}</strong>
                        <small>{text(`state.${node.state}`)}</small>
                      </summary>
                      <p className="node-detail">
                        {translate(definition.detail, locale) !== translate(definition.title, locale)
                          ? translate(definition.detail, locale)
                          : null}
                      </p>
                      {note && <p className="node-note">{translate(note, locale)}</p>}
                      {definition.link && (
                        <p className="node-link">
                          <a href={definition.link.url} target="_blank" rel="noopener noreferrer">
                            {text("web.open")}
                          </a>
                        </p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ol>

            {caseId && caseSnapshot.artifacts.length > 0 && (
              <JourneyArtifacts
                caseId={caseId}
                locale={locale}
                snapshot={caseSnapshot}
                onDraftChange={(draft) => setCaseSnapshot((currentSnapshot) => currentSnapshot ? {
                  ...currentSnapshot,
                  artifactDrafts: { ...currentSnapshot.artifactDrafts, "escalation-draft": draft },
                } : currentSnapshot)}
              />
            )}

            {caseId && <a className="case-card-link" href={caseCardHref(caseId)}>{text("case.openCaseCard")}</a>}

            <button className="reset-demo" type="button" onClick={resetDemo}>
              {text("case.startOver")}
            </button>
          </section>

          {!current?.report && <form className="answer-form" onSubmit={send}>
            <button
              className={`mic ${recording ? "recording" : ""}`}
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? text("chat.recordStop") : text("chat.recordStart")}
            >
              {recording ? "■" : "●"}
            </button>
            <textarea
              aria-label={text("answer.label")}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={text("answer.placeholder")}
              rows={2}
              maxLength={2_000}
            />
            <button className="send" disabled={busy || !answer.trim()} type="submit">
              {text("answer.send")}
            </button>
          </form>}
        </>
      )}

    </main>
  );
}

export default function Home() {
  return <Suspense fallback={null}><HomeContent /></Suspense>;
}
