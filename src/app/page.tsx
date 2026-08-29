"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { initialCase, type CaseSnapshot } from "@/lib/case";
import { stopMediaStream } from "@/lib/media";
import { ContributorPanel } from "./contributor-panel";

type Message = { from: "sahayak" | "citizen"; text: string };

export default function Home() {
  const [contributorMode, setContributorMode] = useState(false);
  const [caseSnapshot, setCaseSnapshot] = useState<CaseSnapshot>(initialCase);
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "sahayak",
      text: "नमस्ते। Form 4 में नाम Shyam Sunder मिला है। क्या यह सही है?",
    },
  ]);
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

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = message.trim();
    if (!text || busy) return;

    setMessage("");
    setMessages((current) => [...current, { from: "citizen", text }]);
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, caseSnapshot }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed");

      setCaseSnapshot(result.caseSnapshot);
      setMessages((current) => [
        ...current,
        { from: "sahayak", text: result.reply },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { from: "sahayak", text: "अभी जवाब नहीं मिला। कृपया फिर कोशिश करें।" },
      ]);
    } finally {
      setBusy(false);
    }
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

      {contributorMode ? <ContributorPanel /> : <>

      <section className="intro">
        <p className="eyebrow">परिवार में मृत्यु के बाद</p>
        <h1>सरकारी काम, एक बातचीत में।</h1>
        <p>Tell us what happened. We will keep every next step visible.</p>
      </section>

      <section className="case-card">
        <div className="case-heading">
          <div>
            <p className="eyebrow">केस की स्थिति</p>
            <h2>Bereavement claim</h2>
          </div>
          <span className="synthetic">SYNTHETIC DEMO</span>
        </div>
        <ol className="timeline">
          {caseSnapshot.nodes.map((node) => (
            <li key={node.id} className={node.state}>
              <span className="dot" />
              <div>
                <strong>{node.title}</strong>
                <small>{node.state === "done" ? "पूरा" : node.state === "needs-you" ? "आपकी ज़रूरत" : "आगे"}</small>
              </div>
            </li>
          ))}
        </ol>
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

      </>}
      <footer>Independent hackathon prototype. Not affiliated with any government body.</footer>
    </main>
  );
}
