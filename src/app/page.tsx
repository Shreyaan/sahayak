"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useEffect, useRef, useState } from "react";
import { artifactContent } from "@/lib/artifacts";
import { t as translate, tList, type Locale } from "@/lib/locale";
import { stopMediaStream } from "@/lib/media";
import {
  findNode,
  getWorkflowDefinition,
  nodeNote,
  registerWorkflowDefinition,
  startCase,
  workflows,
  type CaseSnapshot,
  type WorkflowDefinition,
} from "@/lib/workflow";
import { ContributorPanel } from "./contributor-panel";
import { LanguageSwitcher } from "./language-switcher";

type StoredCase = {
  id: string;
  workflowId: string;
  snapshot: CaseSnapshot;
  updatedAt: string;
};

/** Carries the live case to the Case Card, which re-reads all content from the seed. */
function caseCardHref(caseSnapshot: CaseSnapshot): string {
  const json = JSON.stringify(caseSnapshot);
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `/case-card?case=${base64}`;
}

export default function Home() {
  const text = useTranslations("citizen");
  const common = useTranslations("common");
  const locale = useLocale() as Locale;

  const [contributorMode, setContributorMode] = useState(false);
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>(Object.values(workflows));
  const [savedCases, setSavedCases] = useState<StoredCase[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [caseSnapshot, setCaseSnapshot] = useState<CaseSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
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

  /** Re-reads every journey (bundled and user-added) into the client registry. */
  async function refreshWorkflows() {
    try {
      const response = await fetch("/api/workflows");
      const result = await response.json();
      if (!Array.isArray(result.workflows)) return;
      for (const definition of result.workflows) registerWorkflowDefinition(definition);
      setDefinitions(result.workflows);
    } catch {
      // The bundled definitions are already registered; nothing to do.
    }
  }

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
    void refreshWorkflows();
    void refreshCases();
  }, []);

  /**
   * The server is the only authority for case transitions: whatever snapshot it
   * returns replaces local state. Nothing is decided on the client. The reply
   * arrives already written in the active language, and is shown as the latest
   * update under the current action.
   */
  async function ask(body: Record<string, unknown>) {
    if (busy || !caseSnapshot) return;

    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, locale, caseSnapshot, ...(caseId ? { caseId } : {}) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");

      setCaseSnapshot(result.caseSnapshot);
      setFeedback(result.reply);
    } catch {
      setFeedback(text("error.request"));
    } finally {
      setBusy(false);
    }
  }

  function answerWithIntent(intent: "affirmative" | "negative") {
    return ask({ action: "reply", intent });
  }

  function advanceDay() {
    return ask({ action: "advance-day" });
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
  }

  async function startJourney(workflowId: string) {
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      openCase(result.caseSnapshot, result.caseId);
    } catch {
      // The case still runs without persistence when the server call fails.
      openCase(startCase(workflowId), null);
    }
  }

  function resetDemo() {
    stopActiveRecording(true);
    setCaseSnapshot(null);
    setCaseId(null);
    setFeedback("");
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

  const workflow = caseSnapshot && getWorkflowDefinition(caseSnapshot.workflowId);
  const openNode = caseSnapshot?.nodes.find((node) => node.state === "needs-you");
  const current = caseSnapshot && openNode ? findNode(caseSnapshot.workflowId, openNode.id) : undefined;
  const waiting = caseSnapshot?.nodes.some((node) => node.state === "verifying") ?? false;
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
    <main>
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
        <ContributorPanel onWorkflowAdded={() => void refreshWorkflows()} />
      ) : !caseSnapshot || !workflow ? (
        <>
          <section className="intro">
            <p className="eyebrow">{common("tagline")}</p>
            <h1>{text("intro.heading")}</h1>
            <p>{text("intro.lead")}</p>
          </section>

          <section className="journeys">
            <div className="journey-grid">
              {definitions.map((definition) => (
                <button
                  key={definition.id}
                  className="journey"
                  type="button"
                  onClick={() => void startJourney(definition.id)}
                >
                  <strong>{translate(definition.title, locale)}</strong>
                  <small>{translate(definition.subtitle, locale)}</small>
                  <span className="journey-go">{text("journeyStart")}</span>
                </button>
              ))}
            </div>
          </section>

          {savedCases.length > 0 && (
            <section className="journeys">
              <p className="eyebrow">{text("yourCases.heading")}</p>
              <div className="journey-grid">
                {savedCases.map((stored) => {
                  const definition = getWorkflowDefinition(stored.snapshot.workflowId);

                  return (
                    <button
                      key={stored.id}
                      className="journey"
                      type="button"
                      onClick={() => openCase(stored.snapshot, stored.id)}
                    >
                      <strong>
                        {definition
                          ? translate(definition.title, locale)
                          : stored.snapshot.workflowId}
                      </strong>
                      <small>{text("yourCases.day", { day: stored.snapshot.day })}</small>
                      <span className="journey-go">{text("yourCases.resume")}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
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

            <div className="demo-clock">
              <div>
                <strong>{text("case.day", { day: caseSnapshot.day })}</strong>
                <small>{text("case.demoTime")}</small>
              </div>
              <button className="secondary-action" type="button" disabled={busy} onClick={() => void advanceDay()}>
                {text("case.advanceDay")}
              </button>
            </div>

            <ol className="timeline">
              {caseSnapshot.nodes.map((node) => {
                const definition = findNode(caseSnapshot.workflowId, node.id);
                if (!definition) return null;
                const isCurrent = node.state === "needs-you";
                const note = nodeNote(caseSnapshot, node.id);

                return (
                  <li key={node.id} className={node.state}>
                    <span className="dot" />
                    <details open={isCurrent}>
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
                      {isCurrent && definition.visit && (
                        <div className="visit-card">
                          <p className="eyebrow">{text("visit.eyebrow")}</p>
                          <strong>{translate(definition.visit.office, locale)}</strong>
                          <p>{translate(definition.visit.why, locale)}</p>
                          <p className="visit-label">{text("visit.carry")}</p>
                          <ul>
                            {tList(definition.visit.carry, locale).map((item) => <li key={item}>{item}</li>)}
                          </ul>
                          <p className="visit-label">{text("visit.script")}</p>
                          <p className="visit-script">“{translate(definition.visit.script, locale)}”</p>
                          <p className="visit-label">{text("visit.expect")}</p>
                          <p>{translate(definition.visit.expect, locale)}</p>
                          <p className="visit-label">{text("visit.collect")}</p>
                          <p>{translate(definition.visit.collect, locale)}</p>
                          <p className="visit-warning">
                            {text("visit.warning")}
                            <em>{text("visit.warningNote")}</em>
                          </p>
                        </div>
                      )}
                    </details>
                  </li>
                );
              })}
            </ol>

            {caseSnapshot.artifacts.length > 0 && (
              <div className="artifacts">
                <p className="eyebrow">{text("case.artifacts")}</p>
                <ul>
                  {caseSnapshot.artifacts.map((id) => (
                    <li key={id}>
                      <a href={caseCardHref(caseSnapshot)}>
                        <strong>{translate(artifactContent[id].title, locale)}</strong>
                        <small>{translate(artifactContent[id].subtitle, locale)}</small>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a className="case-card-link" href={caseCardHref(caseSnapshot)}>
              {text("case.openCaseCard")}
            </a>

            <button className="reset-demo" type="button" onClick={resetDemo}>
              {text("case.startOver")}
            </button>
          </section>

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
                <div className="action-buttons">
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
                </div>
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
          </section>

          <form className="answer-form" onSubmit={send}>
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
          </form>
        </>
      )}

      <footer>
        <nav className="footer-links">
          <a href="/case-card?workflow=bereavement">{common("sampleCaseCard")}</a>
        </nav>
      </footer>
    </main>
  );
}
