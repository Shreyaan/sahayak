"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { artifactContent } from "@/lib/artifacts";
import { stopMediaStream } from "@/lib/media";
import {
  findNode,
  nodeNote,
  startCase,
  workflowIds,
  workflows,
  type CaseSnapshot,
  type NodeState,
  type WorkflowId,
} from "@/lib/workflow";
import { ContributorPanel } from "./contributor-panel";

type Message = { from: "sahayak" | "citizen"; text: string };

/** Hindi-first label, English secondary, for each of the five node states. */
const stateLabel: Record<NodeState, string> = {
  pending: "आगे · Pending",
  "needs-you": "आपकी ज़रूरत · Needs you",
  verifying: "जाँच जारी · Verifying",
  blocked: "अटका · Blocked",
  done: "पूरा · Done",
};

const requestFailed = "अभी जवाब नहीं मिला। कृपया फिर कोशिश करें।";

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

  /**
   * The server is the only authority for case transitions: whatever snapshot it
   * returns replaces local state. Nothing is decided on the client.
   */
  async function ask(body: Record<string, unknown>, echo?: string) {
    if (busy || !caseSnapshot) return;

    if (echo) setMessages((current) => [...current, { from: "citizen", text: echo }]);
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, caseSnapshot }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");

      setCaseSnapshot(result.caseSnapshot);
      setMessages((current) => [...current, { from: "sahayak", text: result.reply }]);
    } catch {
      setMessages((current) => [...current, { from: "sahayak", text: requestFailed }]);
    } finally {
      setBusy(false);
    }
  }

  function reply(text: string) {
    return ask({ action: "reply", message: text }, text);
  }

  function advanceDay() {
    return ask({ action: "advance-day" });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;

    setMessage("");
    void reply(text);
  }

  function startJourney(workflowId: WorkflowId) {
    const workflow = workflows[workflowId];
    const first = findNode(workflowId, workflow.firstNodeId);

    setCaseSnapshot(startCase(workflowId));
    setMessage("");
    setMessages([
      { from: "sahayak", text: "नमस्ते। मैं सहायक हूँ। हर अगला कदम आपको दिखता रहेगा।" },
      ...(first ? [{ from: "sahayak" as const, text: first.ask }] : []),
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

        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          setMessage(result.transcript);
        } catch {
          setMessages((current) => [...current, { from: "sahayak", text: "आवाज़ समझ नहीं आई। जवाब लिखकर भेजें।" }]);
        }
      };
      mediaRecorder.onerror = () => {
        stopActiveRecording(true);
        setMessages((current) => [...current, {
          from: "sahayak",
          text: "रिकॉर्डिंग रुक गई। आप लिखकर जारी रख सकते हैं।",
        }]);
      };
      mediaRecorder.start();
      setRecording(true);
      recordingTimeout.current = setTimeout(() => stopActiveRecording(false), 30_000);
    } catch {
      stopActiveRecording(true);
      setMessages((current) => [...current, { from: "sahayak", text: "माइक उपलब्ध नहीं है। आप लिखकर जारी रख सकते हैं।" }]);
    }
  }

  async function speak(text: string) {
    let url: string | undefined;

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
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
      setMessages((current) => [...current, {
        from: "sahayak",
        text: "अभी जवाब सुनाया नहीं जा सका। आप इसे यहीं पढ़ सकते हैं।",
      }]);
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
  const chips = current ? (current.onDecline ? ["हाँ", "नहीं"] : ["हाँ"]) : [];

  return (
    <main>
      <header>
        <div className="brand">सहायक <span>Sahayak</span></div>
        <button
          className="author-link"
          type="button"
          aria-pressed={contributorMode}
          onClick={toggleContributorMode}
        >
          {contributorMode ? "नागरिक · Citizen" : "योगदान दें · Contribute"}
        </button>
      </header>

      {contributorMode ? <ContributorPanel /> : !caseSnapshot || !workflow ? (
        <>
          <section className="intro">
            <p className="eyebrow">सरकारी काम, एक बातचीत में</p>
            <h1>कौन सा काम अटका है?</h1>
            <p>Pick a journey. We will keep every next step visible.</p>
          </section>

          <section className="journeys">
            <span className="synthetic">SYNTHETIC DEMO</span>
            <div className="journey-grid">
              {workflowIds.map((id) => (
                <button key={id} className="journey" type="button" onClick={() => startJourney(id)}>
                  <strong>{workflows[id].title}</strong>
                  <small>{workflows[id].subtitle}</small>
                  <span className="journey-go">शुरू करें · Start</span>
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
                <p className="eyebrow">केस की स्थिति</p>
                <h2>{workflow.title}</h2>
                <p className="case-subtitle">{workflow.subtitle}</p>
              </div>
              <span className="synthetic">SYNTHETIC DEMO</span>
            </div>

            <div className="demo-clock">
              <div>
                <strong>दिन {caseSnapshot.day} · Day {caseSnapshot.day}</strong>
                <small>नमूना समय · Simulated demo time</small>
              </div>
              <button className="secondary-action" type="button" disabled={busy} onClick={() => void advanceDay()}>
                एक दिन आगे
              </button>
            </div>

            {waiting && (
              <p className="waiting" role="status">
                <span className="waiting-dot" />
                दफ़्तर की जाँच चल रही है। जवाब का इंतज़ार है — “एक दिन आगे” दबाकर समय बढ़ाइए.
                <em>Waiting on a simulated desk.</em>
              </p>
            )}

            <ol className="timeline">
              {caseSnapshot.nodes.map((node) => {
                const definition = findNode(caseSnapshot.workflowId, node.id);
                if (!definition) return null;
                const isCurrent = node.state === "needs-you";

                return (
                  <li key={node.id} className={node.state}>
                    <span className="dot" />
                    <details open={isCurrent}>
                      <summary>
                        <strong>{definition.title}</strong>
                        <small>{stateLabel[node.state]}</small>
                      </summary>
                      <p className="node-detail">{definition.detail}</p>
                      {nodeNote(caseSnapshot, node.id) && (
                        <p className="node-note">{nodeNote(caseSnapshot, node.id)}</p>
                      )}
                      {isCurrent && definition.visit && (
                        <div className="visit-card">
                          <p className="eyebrow">दफ़्तर जाना है · Office visit</p>
                          <strong>{definition.visit.office}</strong>
                          <p>{definition.visit.why}</p>
                          <p className="visit-label">साथ ले जाइए · Carry</p>
                          <ul>
                            {definition.visit.carry.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                          <p className="visit-label">काउंटर पर कहिए · Script</p>
                          <p className="visit-script">“{definition.visit.script}”</p>
                          <p className="visit-label">अनुमानित समय · Expect</p>
                          <p>{definition.visit.expect}</p>
                          <p className="visit-label">लेकर आइए · Collect</p>
                          <p>{definition.visit.collect}</p>
                          <p className="visit-warning">
                            किसी दलाल या अनधिकृत एजेंट को पैसे मत दीजिए।
                            <em>Do not pay an unauthorized agent.</em>
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
                <p className="eyebrow">बने हुए काग़ज़ · Artifacts</p>
                <ul>
                  {caseSnapshot.artifacts.map((id) => (
                    <li key={id}>
                      <a href={caseCardHref(caseSnapshot)}>
                        <strong>{artifactContent[id].title}</strong>
                        <small>{artifactContent[id].subtitle}</small>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a className="case-card-link" href={caseCardHref(caseSnapshot)}>
              Case Card खोलें · Open Case Card
            </a>

            <button className="reset-demo" type="button" onClick={resetDemo}>
              दूसरा काम चुनें · Start over
            </button>
          </section>

          <section className="chat" aria-live="polite">
            {messages.map((item, index) => (
              <div key={index} className={`message ${item.from}`}>
                <p className={`bubble ${item.from}`}>{item.text}</p>
                {item.from === "sahayak" && (
                  <button className="speak" type="button" onClick={() => speak(item.text)} aria-label="जवाब सुनें">🔊 सुनें</button>
                )}
              </div>
            ))}
            {busy && <p className="bubble sahayak">सोच रहा हूँ…</p>}
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
            <button className={`mic ${recording ? "recording" : ""}`} type="button" onClick={toggleRecording} aria-label={recording ? "रिकॉर्डिंग रोकें" : "आवाज़ रिकॉर्ड करें"}>
              {recording ? "■" : "●"}
            </button>
            <input
              aria-label="अपना जवाब लिखें"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="अपना जवाब लिखें…"
              maxLength={2_000}
            />
            <button className="send" disabled={busy} type="submit">भेजें</button>
          </form>
        </>
      )}

      <footer>
        <p>Independent hackathon prototype. Not affiliated with any government body.</p>
        <nav className="footer-links">
          <a href="/honesty">क्या असली, क्या नमूना · What is real</a>
          <a href="/case-card?workflow=bereavement">नमूना Case Card · Sample</a>
        </nav>
      </footer>
    </main>
  );
}
