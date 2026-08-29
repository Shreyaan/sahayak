"use client";

import { useLocale, useTranslations } from "next-intl";
import { FormEvent, useEffect, useRef, useState } from "react";
import { artifactContent } from "@/lib/artifacts";
import { t as translate, tList, type Locale } from "@/lib/locale";
import { stopMediaStream } from "@/lib/media";
import {
  findNode,
  nodeNote,
  startCase,
  workflowIds,
  workflows,
  type CaseSnapshot,
  type WorkflowId,
} from "@/lib/workflow";
import { ContributorPanel } from "./contributor-panel";
import { LanguageSwitcher } from "./language-switcher";

type Message = { from: "sahayak" | "citizen"; text: string };

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
  const [caseSnapshot, setCaseSnapshot] = useState<CaseSnapshot | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
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

  function sayBack(reply: string) {
    setMessages((current) => [...current, { from: "sahayak", text: reply }]);
  }

  /**
   * The server is the only authority for case transitions: whatever snapshot it
   * returns replaces local state. Nothing is decided on the client. The reply
   * arrives already written in the active language.
   */
  async function ask(body: Record<string, unknown>, echo?: string) {
    if (busy || !caseSnapshot) return;

    if (echo) setMessages((current) => [...current, { from: "citizen", text: echo }]);
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, locale, caseSnapshot }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");

      setCaseSnapshot(result.caseSnapshot);
      sayBack(result.reply);
    } catch {
      sayBack(text("error.request"));
    } finally {
      setBusy(false);
    }
  }

  function reply(value: string) {
    return ask({ action: "reply", message: value }, value);
  }

  function advanceDay() {
    return ask({ action: "advance-day" });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;

    setMessage("");
    void reply(value);
  }

  function startJourney(workflowId: WorkflowId) {
    const workflow = workflows[workflowId];
    const first = findNode(workflowId, workflow.firstNodeId);

    setCaseSnapshot(startCase(workflowId));
    setMessage("");
    setMessages([
      { from: "sahayak", text: text("chat.greeting") },
      ...(first ? [{ from: "sahayak" as const, text: translate(first.ask, locale) }] : []),
    ]);
  }

  function resetDemo() {
    stopActiveRecording(true);
    setCaseSnapshot(null);
    setMessages([]);
    setMessage("");
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
          setMessage(result.transcript);
        } catch {
          sayBack(text("error.transcribe"));
        }
      };
      mediaRecorder.onerror = () => {
        stopActiveRecording(true);
        sayBack(text("error.recording"));
      };
      mediaRecorder.start();
      setRecording(true);
      recordingTimeout.current = setTimeout(() => stopActiveRecording(false), 30_000);
    } catch {
      stopActiveRecording(true);
      sayBack(text("error.microphone"));
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
      sayBack(text("error.speech"));
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  function toggleContributorMode() {
    if (!contributorMode) stopActiveRecording(true);
    setContributorMode((current) => !current);
  }

  const workflow = caseSnapshot && workflows[caseSnapshot.workflowId];
  const openNode = caseSnapshot?.nodes.find((node) => node.state === "needs-you");
  const current = caseSnapshot && openNode ? findNode(caseSnapshot.workflowId, openNode.id) : undefined;
  const waiting = caseSnapshot?.nodes.some((node) => node.state === "verifying") ?? false;
  const chips = current
    ? [
        current.confirmLabel ? translate(current.confirmLabel, locale) : text("chat.yes"),
        ...(current.onDecline
          ? [current.declineLabel ? translate(current.declineLabel, locale) : text("chat.no")]
          : []),
      ]
    : [];

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

      {contributorMode ? <ContributorPanel /> : !caseSnapshot || !workflow ? (
        <>
          <section className="intro">
            <p className="eyebrow">{common("tagline")}</p>
            <h1>{text("intro.heading")}</h1>
            <p>{text("intro.lead")}</p>
          </section>

          <section className="journeys">
            <span className="synthetic">{common("synthetic")}</span>
            <div className="journey-grid">
              {workflowIds.map((id) => (
                <button key={id} className="journey" type="button" onClick={() => startJourney(id)}>
                  <strong>{translate(workflows[id].title, locale)}</strong>
                  <small>{translate(workflows[id].subtitle, locale)}</small>
                  <span className="journey-go">{text("journeyStart")}</span>
                </button>
              ))}
            </div>
          </section>
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
              <span className="synthetic">{common("synthetic")}</span>
            </div>

            <div className="demo-clock">
              <div>
                <strong>{text("case.day", { day: caseSnapshot.day })}</strong>
                <small>{text("case.simulatedTime")}</small>
              </div>
              <button className="secondary-action" type="button" disabled={busy} onClick={() => void advanceDay()}>
                {text("case.advanceDay")}
              </button>
            </div>

            {waiting && (
              <p className="waiting" role="status">
                <span className="waiting-dot" />
                {text("case.waiting")}
                <em>{text("case.waitingNote")}</em>
              </p>
            )}

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
                      <p className="node-detail">{translate(definition.detail, locale)}</p>
                      {note && <p className="node-note">{translate(note, locale)}</p>}
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

          <section className="chat" aria-live="polite">
            {messages.map((item, index) => (
              <div key={index} className={`message ${item.from}`}>
                <p className={`bubble ${item.from}`}>{item.text}</p>
                {item.from === "sahayak" && (
                  <button
                    className="speak"
                    type="button"
                    onClick={() => speak(item.text)}
                    aria-label={text("chat.listenLabel")}
                  >
                    🔊 {text("chat.listen")}
                  </button>
                )}
              </div>
            ))}
            {busy && <p className="bubble sahayak">{text("chat.thinking")}</p>}
          </section>

          {chips.length > 0 && (
            <div className="chips">
              {chips.map((chip) => (
                <button key={chip} className="chip" type="button" disabled={busy} onClick={() => void reply(chip)}>
                  {chip}
                </button>
              ))}
            </div>
          )}

          <form className="chat-form" onSubmit={send}>
            <button
              className={`mic ${recording ? "recording" : ""}`}
              type="button"
              onClick={toggleRecording}
              aria-label={recording ? text("chat.recordStop") : text("chat.recordStart")}
            >
              {recording ? "■" : "●"}
            </button>
            <input
              aria-label={text("chat.inputLabel")}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={text("chat.placeholder")}
              maxLength={2_000}
            />
            <button className="send" disabled={busy} type="submit">{text("chat.send")}</button>
          </form>
        </>
      )}

      <footer>
        <p>{common("disclaimer")}</p>
        <nav className="footer-links">
          <a href="/honesty">{common("whatIsReal")}</a>
          <a href="/case-card?workflow=bereavement">{common("sampleCaseCard")}</a>
        </nav>
      </footer>
    </main>
  );
}
