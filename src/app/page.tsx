"use client";

import { caseAction, unmatchedResponse } from "@/lib/response-guidance";

import { useLocale, useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { t as translate, tList, type Locale } from "@/lib/locale";
import { recoveryContext } from "@/lib/recovery-context";
import { ActionBriefPreview } from "./action-brief-preview";
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
export function transitionFeedback(
  reply: string,
  actedStepId: string | undefined,
  snapshot: CaseSnapshot
): string {
  const nextStepId = snapshot.nodes.find(
    (node) => node.state === "needs-you" || node.state === "verifying"
  )?.id;
  return actedStepId && nextStepId && actedStepId !== nextStepId ? "" : reply;
}

/** `.visit-card p` (globals.css) styles any plain paragraph inside the card; kept as one string so every plain line matches it. */
const VISIT_DETAIL_TEXT =
  "m-[6px_0px_0px] text-[#536059] text-[.86rem] leading-[1.5]";
/** `.visit-card .visit-label` overrides color/size/weight but the margin and line-height still cascade in from `.visit-card p`. */
const VISIT_LABEL_TEXT =
  "mt-3 mx-0 mb-0 text-[var(--green)] text-[.72rem] leading-[1.5] font-extrabold tracking-[.08em] uppercase";

function VisitCard({
  node,
  locale,
}: {
  node: WorkflowDefinition["nodes"][number];
  locale: Locale;
}) {
  const text = useTranslations("citizen");
  if (!node.visit) return null;

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-5 text-[var(--ink)]">
      <strong className="mt-1.5 block">
        {translate(node.visit.office, locale)}
      </strong>

      <p className={VISIT_LABEL_TEXT}>{text("visit.carry")}</p>
      <ul className="mt-1.5 pl-5 text-[.86rem] leading-[1.6] text-[#536059]">
        {tList(node.visit.carry, locale).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className={VISIT_LABEL_TEXT}>{text("visit.script")}</p>
      <p
        className={`${VISIT_DETAIL_TEXT} rounded-[10px] bg-[#f3efe7] px-2.5 py-2 italic`}
      >
        “{translate(node.visit.script, locale)}”
      </p>
      <p className={VISIT_LABEL_TEXT}>{text("visit.collect")}</p>
      <p className={VISIT_DETAIL_TEXT}>
        {translate(node.visit.collect, locale)}
      </p>
      <details className="mt-2 text-sm text-[#536059]">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">{locale === "hi" ? "समय और ध्यान रखने वाली बातें" : "Timing and things to check"}</summary>
        <p className="pb-2 leading-relaxed">{translate(node.visit.expect, locale)}</p>
        <p className="pb-2 font-medium">{text("visit.warning")}</p>
      </details>
    </div>
  );
}

/**
 * `.timeline li.<state>` (globals.css) recolors a history row per node state; `pending` has no
 * override there, so it keeps the base `.timeline li` grey below.
 */
const TIMELINE_TEXT_CLASS: Record<string, string> = {
  "needs-you": "text-[var(--ink)]",
  done: "text-[var(--green)]",
  verifying: "text-[#7a530a]",
  blocked: "text-[#8b2e24]",
};

/** `.<state> .dot` (globals.css); unmatched states fall back to an unfilled ring in the row's own color. */
const TIMELINE_DOT_CLASS: Record<string, string> = {
  done: "bg-[var(--green)]",
  "needs-you": "bg-[var(--marigold)] border-[var(--marigold)]",
  verifying:
    "bg-[repeating-linear-gradient(45deg,#b8801a,#b8801a_3px,transparent_3px,transparent_6px)] border-[#b8801a]",
  blocked: "bg-[#8b2e24] border-[#8b2e24]",
};

export function HomeContent() {
  const text = useTranslations("citizen");
  const common = useTranslations("common");
  const locale = useLocale() as Locale;
  const [activeCaseId, setActiveCaseId] = useQueryState("caseId", {
    history: "replace",
  });
  const requestError = text("error.request");

  const [contributorMode, setContributorMode] = useState(false);
  const [savedCases, setSavedCases] = useState<StoredCase[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [caseSnapshot, setCaseSnapshot] = useState<CaseSnapshot | null>(null);
  const [feedback, setFeedback] = useState("");
  const [responseEntryStepId, setResponseEntryStepId] = useState<string>();
  const [briefPending, setBriefPending] = useState(false);
  const [briefPreview, setBriefPreview] = useState<string>();
  const [canShare, setCanShare] = useState(false);
  const [reportStepId, setReportStepId] = useState<string>();
  const [answer, setAnswer] = useState("");
  const [chatTurns, setChatTurns] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatError, setChatError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [resumeAttempt, setResumeAttempt] = useState(0);
  const actionHeading = useRef<HTMLHeadingElement>(null);
  const briefButton = useRef<HTMLButtonElement>(null);
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
        registerWorkflowDefinition(
          result.definition as WorkflowDefinition,
          result.case.snapshot.workflowVersionId
        );
        openCase(result.case.snapshot, result.case.id);
      })
      .catch(() => {
        if (!cancelled) setFeedback(requestError);
      });

    return () => {
      cancelled = true;
    };
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
    const actedStepId = caseSnapshot.nodes.find(
      (node) => node.state === "needs-you" || node.state === "verifying"
    )?.id;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          locale,
          caseSnapshot,
          ...(caseId ? { caseId } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "CASE_CONFLICT") {
          setFeedback(
            locale === "hi"
              ? "केस दूसरी जगह बदल गया। आपकी लिखी बात अभी यहाँ है, लेकिन सुरक्षित नहीं हुई। इसे कॉपी करें और Case Card से नया कदम खोलें।"
              : "This case changed in another request. Your entry is still here, but was not saved. Copy it before opening the latest action from the Case Card."
          );
          return false;
        }
        throw new Error(result.error || "Request failed");
      }

      if (body.action === "help") {
        setChatTurns(turns => [...turns, { role: "user", content: String(body.message) }, { role: "assistant", content: result.reply }].slice(-8) as typeof turns);
        return true;
      }
      const nextStepId = result.caseSnapshot.nodes.find((node: { id: string; state: string }) => node.state === "needs-you")?.id;
      if (nextStepId !== actedStepId) {
        setChatTurns([]);
        setChatError("");
        setAnswer("");
      }
      setCaseSnapshot(result.caseSnapshot);
      if (body.action === "record-desk-response") setResponseEntryStepId(undefined);
      setFeedback(
        body.action === "record-desk-response" && getCaseWorkflowDefinition(result.caseSnapshot) && unmatchedResponse(result.caseSnapshot, getCaseWorkflowDefinition(result.caseSnapshot)!)
          ? (locale === "hi" ? "जवाब सुरक्षित है। मार्गदर्शन रुका है।" : "Response saved. Guidance is paused.")
          : transitionFeedback(result.reply, actedStepId, result.caseSnapshot)
      );
      const actedStep = actedStepId
        ? result.caseSnapshot.nodes.find(
            (node: { id: string }) => node.id === actedStepId
          )
        : undefined;
      if (body.action === "record-desk-response" || actedStep?.state === "done")
        setReportStepId(actedStepId);
      return true;
    } catch {
      if (body.action === "help") setChatError(locale === "hi" ? "जवाब नहीं मिल पाया। आपकी बात यहीं है; फिर कोशिश करें।" : "Could not get an answer. Your question is still here; try again.");
      else setFeedback(text("error.request"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function answerWithIntent(intent: "affirmative" | "negative") {
    return ask({ action: "reply", intent });
  }

  function askQuestion(question: string) {
    const value = question.trim();
    if (!value || busy) return;
    setAnswer(value);
    setChatError("");
    void ask({ action: "help", message: value, conversation: chatTurns }).then((saved) => {
      if (saved) setAnswer(current => current === value ? "" : current);
    });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    askQuestion(answer);
  }

  /** Opens a case, whether it came from the server or locally. */
  function openCase(caseSnapshot: CaseSnapshot, id: string | null) {
    setChatTurns([]);
    setChatError("");
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

      registerWorkflowDefinition(
        result.definition as WorkflowDefinition,
        result.caseSnapshot.workflowVersionId
      );
      openCase(result.caseSnapshot, result.caseId);
      await setActiveCaseId(result.caseId);
    } catch {
      setFeedback(text("error.request"));
    }
  }

  function resetDemo() {
    stopActiveRecording(true);
    setContributorMode(false);
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
        form.append(
          "audio",
          new File(chunks, "voice.webm", { type: mediaRecorder.mimeType })
        );
        // The speech model needs to know which language it is listening to.
        form.append("locale", locale);

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
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
      recordingTimeout.current = setTimeout(
        () => stopActiveRecording(false),
        30_000
      );
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

  function downloadBrief(text: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `sahayak-next-step-${locale}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  /**
   * A file in the Downloads folder is not where a citizen keeps things, so the
   * share sheet — which reaches WhatsApp, notes and print — is the main offer
   * wherever the browser supports it. The file stays available beside it
   * rather than being chosen for the citizen by guessing at their device.
   */
  async function keepNextStep(mode: "share" | "download" | "preview") {
    if (!caseId || briefPending) return;
    setBriefPending(true);
    try {
      const response = await fetch(
        `/api/cases/${encodeURIComponent(caseId)}?download=next-step&locale=${locale}`
      );
      if (!response.ok) throw new Error("BRIEF_UNAVAILABLE");
      const text = await response.text();
      if (mode === "preview") { setBriefPreview(text); return; }

      if (
        mode === "share" &&
        typeof navigator !== "undefined" &&
        navigator.share
      ) {
        try {
          await navigator.share({
            title:
              locale === "hi" ? "सहायक — अगला कदम" : "Sahayak — your next step",
            text,
          });
          return;
        } catch (error) {
          // Backing out of the share sheet is a decision, not a failure.
          if ((error as Error)?.name === "AbortError") return;
        }
      }

      downloadBrief(text);
    } catch {
      setFeedback(
        locale === "hi"
          ? "अभी यह कदम सहेजा नहीं जा सका। तैयारी नीचे मौजूद है; फिर कोशिश करें।"
          : "This step could not be saved. Your preparation is still below; try again."
      );
    } finally {
      setBriefPending(false);
    }
  }

  function toggleContributorMode() {
    if (!contributorMode) stopActiveRecording(true);
    setContributorMode((current) => !current);
  }

  const workflow = caseSnapshot && getCaseWorkflowDefinition(caseSnapshot);
  const unmatched = caseSnapshot && workflow ? unmatchedResponse(caseSnapshot, workflow) : undefined;
  const current = caseSnapshot && workflow ? caseAction(caseSnapshot, workflow) : undefined;
  useEffect(() => {
    setCanShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    );
  }, []);
  useEffect(() => {
    if (!current) return;
    actionHeading.current?.focus({ preventScroll: true });
    actionHeading.current?.scrollIntoView?.({ block: "start" });
  }, [current?.id, caseId, unmatched?.recordedAt]);
  /** The feedback form rates the step just acted on, which is not the step now shown above it. */
  const reportStepTitle =
    workflow && reportStepId
      ? (() => {
          const node = workflow.nodes.find((item) => item.id === reportStepId);
          return node ? translate(node.title, locale) : undefined;
        })()
      : undefined;
  const waiting =
    caseSnapshot?.nodes.some((node) => node.state === "verifying") ?? false;
  const resolved =
    caseSnapshot?.nodes.some(
      (node) => node.id === "case-done" && node.state === "done"
    ) ?? false;
  const confirmText = current
    ? current.confirmLabel
      ? translate(current.confirmLabel, locale)
      : text("action.yesDefault")
    : "";
  const declineText = current
    ? current.declineLabel
      ? translate(current.declineLabel, locale)
      : text("action.noDefault")
    : "";

  // Speech must never repeat itself: skip the title and detail when the
  // question already carries them.
  const recovery = caseSnapshot && workflow ? recoveryContext(caseSnapshot, workflow) : undefined;
  const helpQuestions = unmatched
    ? (locale === "hi" ? ["मेरे दर्ज जवाब का मतलब समझाएँ", "क्या यह यात्रा अभी मेरी समस्या पर लागू होती है?"] : ["Explain the answer I recorded", "Does this journey still fit my situation?"])
    : current?.id === "pfms-trace"
    ? (locale === "hi" ? ["PFMS क्या है?", "मुझे आवेदन ID नहीं पता", "वेबसाइट नहीं खुल रही"] : ["What is PFMS?", "I don’t know my application ID", "The website isn’t opening"])
    : (locale === "hi" ? ["यह कदम आसान भाषा में समझाएँ", "मुझे क्या साथ ले जाना है?"] : ["Explain this step simply", "What should I take with me?"]);
  const actionTitle = current ? translate(current.title, locale) : "";
  const actionDetail = current ? translate(current.detail, locale) : "";
  const actionAsk = current ? translate(current.ask, locale) : "";
  const showDetail = Boolean(current) && actionDetail !== actionTitle;
  const spokenAction = current
    ? [
        actionAsk.includes(actionTitle) ? null : actionTitle,
        !showDetail || actionAsk.includes(actionDetail) ? null : actionDetail,
        actionAsk,
      ]
        .filter(Boolean)
        .join(". ")
    : "";

  const documentsPanel = useRef<HTMLDetailsElement>(null);
  const artifactPanel =
    caseId && caseSnapshot && caseSnapshot.artifacts.length > 0 ? (
      <JourneyArtifacts
        caseId={caseId}
        locale={locale}
        snapshot={caseSnapshot}
        onDraftChange={(draft) =>
          setCaseSnapshot((currentSnapshot) =>
            currentSnapshot
              ? {
                  ...currentSnapshot,
                  artifactDrafts: {
                    ...currentSnapshot.artifactDrafts,
                    "escalation-draft": draft,
                  },
                }
              : currentSnapshot
          )
        }
      />
    ) : null;

  return (
    <main
      className={`mx-auto min-h-screen w-full px-[18px] pt-[18px] pb-[92px] min-[760px]:pt-[30px] ${contributorMode || !caseSnapshot ? "max-w-[1180px]" : "max-w-[680px]"}`}
    >
      {briefPreview && <ActionBriefPreview content={briefPreview} locale={locale} onClose={() => { setBriefPreview(undefined); briefButton.current?.focus(); }} />}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <button
          className="text-[1.3rem] font-extrabold cursor-pointer border-0 bg-transparent p-0 text-left text-[var(--ink)]"
          type="button"
          onClick={resetDemo}
          title={text("case.startOver")}
          aria-label={`${common("brand")} — ${text("case.startOver")}`}
        >
          {common("brand")}
        </button>
        <div className="flex items-center gap-[10px]">
          <LanguageSwitcher />
          <button
            className="inline-flex min-h-11 items-center border-0 bg-transparent px-1 text-[.82rem] font-bold text-[var(--green)]"
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
        <CitizenHome
          locale={locale}
          savedCases={savedCases}
          feedback={feedback}
          onStart={startJourney}
          onResume={resumeCase}
        />
      ) : (
        <>
          <section className="mt-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">
                  {text("case.eyebrow")}
                </p>
                <h2 className="m-0 mt-1 text-[1.15rem]">
                  {translate(workflow.title, locale)}
                </h2>
                <p className="m-[2px_0px_0px] text-[.78rem] text-[#7a827e]">
                  {translate(workflow.subtitle, locale)}
                </p>
              </div>
            </div>

            {/* {isSyntheticSeed(caseSnapshot.workflowId) && <p className="mt-4 w-fit rounded-full bg-[#fff1cf] px-3 py-1 text-xs font-extrabold text-[#79540d]">{locale === "hi" ? "कृत्रिम उदाहरण यात्रा और रिकॉर्ड" : "Synthetic example journey and records"}</p>} */}

            <section
              className="mt-5 rounded-2xl border border-[var(--line)] bg-white p-6 max-sm:p-4"
              aria-live="polite"
            >
              {current ? (
                <>
                  <p className="m-0 text-[.72rem] font-extrabold uppercase tracking-[.12em] text-[var(--green)]">
                    {locale === "hi" ? "अगला कदम" : "Next step"}
                  </p>
                  <h2
                    ref={actionHeading}
                    tabIndex={-1}
                    className="mx-0 mt-2 mb-3 text-2xl font-bold leading-tight tracking-tight scroll-mt-5 outline-none"
                  >
                    {actionTitle}
                  </h2>
                  {unmatched && <aside className="mb-4 border-l-4 border-[var(--marigold)] bg-[#fff8e8] p-3 text-sm" aria-label={locale === "hi" ? "मार्गदर्शन रुका है" : "Guidance paused"}>
                    <p className="font-bold">{locale === "hi" ? "मार्गदर्शन रुका है — समस्या हल नहीं हुई" : "Guidance paused — unresolved"}</p>
                    <blockquote className="mt-2 whitespace-pre-wrap break-words">{unmatched.response}</blockquote>
                    <p className="mt-2">{unmatched.responseDate}{unmatched.referenceNumber ? ` · ${unmatched.referenceNumber}` : ""}</p>
                  </aside>}
                  {recovery && !unmatched && <details className="mb-4 border-l-2 border-[var(--marigold)] pl-3 text-sm text-[#536059]">
                    <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--green)]">{locale === "hi" ? "पिछला जवाब:" : "Previous response:"} {translate(recovery.option.label, locale)}</summary>
                    <blockquote className="mt-2 whitespace-pre-wrap break-words">“{recovery.report.response}”</blockquote>
                    <p className="mt-2">{recovery.report.responseDate}{recovery.report.referenceNumber ? ` · ${recovery.report.referenceNumber}` : ""}</p>
                    <p className="my-2">{locale === "hi" ? "आपका बताया जवाब। समस्या हल होने की पुष्टि नहीं हुई है।" : "Your reported answer. Resolution has not been confirmed."}</p>
                  </details>}
                  {showDetail && !current.link && (
                    <p className="m-0 mb-4 text-base leading-relaxed text-[#5a6560]">
                      {current.visit ? translate(current.visit.why, locale) : actionDetail}
                    </p>
                  )}
                  {!current.report && <p className="m-0 mb-4 text-base font-semibold leading-relaxed">{actionAsk}</p>}
                  {current.link && <p className="mb-4 text-base leading-relaxed text-[#536059]">{translate(current.detail, locale).split(/(?<=[.!?।])\s+/u).slice(0, 2).join(" ")}</p>}
                  {current.link && (
                    <p className="m-0 mb-3.5 grid gap-1">
                      <a
                        className="justify-self-start rounded-xl bg-[var(--green)] px-4 py-3 font-bold text-white no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--green)]"
                        href={current.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {translate(current.link.action, locale)} ↗
                      </a>
                      <small className="text-[.78rem] text-[#67736d]">
                        {translate(current.link.collect, locale)}
                      </small>
                    </p>
                  )}
                  {current.type === "grievance-file" && !unmatched && artifactPanel && <button
                    type="button"
                    className="my-3 min-h-11 rounded-xl bg-[var(--green)] px-4 py-3 font-bold text-white"
                    onClick={() => {
                      if (!documentsPanel.current) return;
                      documentsPanel.current.open = true;
                      documentsPanel.current.querySelector("summary")?.focus();
                      documentsPanel.current.scrollIntoView({ block: "start" });
                    }}
                  >{locale === "hi" ? "शिकायत का मसौदा तैयार करें" : "Prepare my grievance"}</button>}
                  {current.report ? (
                    responseEntryStepId !== current.id ? (
                      <div className="my-4 print:hidden">
                        <button
                          type="button"
                          className={`min-h-11 rounded-xl px-4 py-3 font-bold disabled:opacity-55 ${current.link ? "border border-[var(--line)] text-[var(--green)]" : "bg-[var(--green)] text-white"}`}
                          onClick={() => setResponseEntryStepId(current.id)}
                        >
                          {unmatched
                            ? (locale === "hi" ? "नया जवाब या सुधार दर्ज करें" : "Record a new answer or correction")
                            : (locale === "hi" ? "मेरे पास दर्ज करने के लिए जवाब है" : "I have a response to record")}
                        </button>
                      </div>
                    ) : (
                      <DeskResponseForm
                        busy={busy}
                        key={current.id}
                        locale={locale}
                        node={current}
                        onSubmit={(deskResponse) =>
                          ask({ action: "record-desk-response", deskResponse })
                        }
                      />
                    )
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        className="rounded-xl border-0 bg-[var(--green)] px-3.5 py-2.5 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-55"
                        type="button"
                        disabled={busy}
                        onClick={() => void answerWithIntent("affirmative")}
                      >
                        {confirmText}
                      </button>
                      {current.onDecline && (
                        <button
                          className="rounded-xl border-0 bg-[#eef2ef] px-3.5 py-2.5 font-extrabold text-[var(--green)]"
                          type="button"
                          disabled={busy}
                          onClick={() => void answerWithIntent("negative")}
                        >
                          {declineText}
                        </button>
                      )}
                      <button
                        className="min-h-11 border-0 bg-transparent px-3 py-2 text-[.8rem] font-bold text-[var(--green)]"
                        type="button"
                        disabled={busy}
                        onClick={() => void speak(spokenAction)}
                        aria-label={text("action.listenLabel")}
                      >
                        🔊 {text("action.listen")}
                      </button>
                    </div>
                  )}
                  {current.link && <details className="mt-3 text-sm text-[#536059]"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{locale === "hi" ? "पूरी जानकारी और पेज न चले तो क्या करें" : "Full instructions and if the page doesn’t work"}</summary><p className="pb-3 leading-relaxed">{actionDetail}</p></details>}
                  {current.link && current.visit ? (
                    <details className="mt-5 rounded-xl bg-[#f4f2eb] px-4">
                      <summary className="cursor-pointer py-4 text-sm font-semibold text-[var(--green)]">{locale === "hi" ? "जानकारी नहीं है या मदद चाहिए? डेस्क पर क्या पूछें" : "Missing details or need help? Prepare for the desk"}</summary>
                      <div className="pb-4"><VisitCard node={current} locale={locale} /></div>
                    </details>
                  ) : <VisitCard node={current} locale={locale} />}
          {current && (
            <section className="mt-6 border-t border-[var(--line)] pt-5 print:hidden" aria-label={locale === "hi" ? "सहायक से पूछें" : "Ask Sahayak"}>
              <h3 className="text-lg font-bold">{locale === "hi" ? "सहायक से पूछें" : "Ask Sahayak"}</h3>

              <div className="mt-3 flex flex-wrap gap-2">{helpQuestions.map(question => <button key={question} type="button" disabled={busy} onClick={() => askQuestion(question)} className="min-h-11 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-left text-sm font-semibold text-[var(--green)] hover:bg-[#edf4ee] disabled:opacity-50">{question}</button>)}</div>
              <div className="mt-3 grid gap-3" role="log" aria-live="polite">
                {chatTurns.map((turn, index) => <div key={index} className={turn.role === "assistant" ? "rounded-xl bg-[#edf4ee] p-3 text-sm leading-relaxed whitespace-pre-wrap" : "ml-6 text-sm text-[#536059] whitespace-pre-wrap"}>
                  <strong className="mb-1 block">{turn.role === "assistant" ? (locale === "hi" ? "सहायक" : "Sahayak") : (locale === "hi" ? "आप" : "You")}</strong>{turn.content}
                  {turn.role === "assistant" && <button type="button" className="mt-2 block min-h-11 font-semibold text-[var(--green)]" onClick={() => void speak(turn.content)}>{locale === "hi" ? "जवाब सुनें" : "Listen to answer"}</button>}
                </div>)}
                {chatError && <p role="alert" className="text-sm text-[#8b2e24]">{chatError}</p>}
              </div>
            <form
              className="mt-5 flex items-end gap-2 border-t border-[var(--line)] pt-4"
              onSubmit={send}
            >
              <button
                className={`h-[42px] w-[42px] shrink-0 rounded-xl border-0 font-extrabold ${recording ? "bg-[#8b2e24] text-white" : "bg-[#eee5d8] text-[var(--green)]"}`}
                type="button"
                onClick={toggleRecording}
                aria-label={
                  recording ? text("chat.recordStop") : text("chat.recordStart")
                }
              >
                {recording ? "■" : "●"}
              </button>
              <textarea
                className="w-full min-w-0 resize-none rounded-lg border border-[var(--line)] bg-white p-2.5 [font:inherit]"
                aria-label={locale === "hi" ? "सहायक से अपना सवाल पूछें" : "Ask Sahayak a question"}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={locale === "hi" ? "इस कदम के बारे में पूछें…" : "Ask about this step…"}
                rows={2}
                maxLength={2_000}
              />
              <button
                className="shrink-0 min-w-[72px] min-h-11 rounded-xl border-0 bg-[var(--marigold)] px-3.5 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-wait disabled:opacity-55"
                disabled={busy || !answer.trim()}
                type="submit"
              >
                {busy ? (locale === "hi" ? "पूछ रहे हैं…" : "Asking…") : (locale === "hi" ? "पूछें" : "Ask")}
              </button>
            </form>
              <p className="mt-2 text-xs text-[#65716b]">{locale === "hi" ? "पूछने से केस नहीं बदलता। ज़रूरी जवाब केस में दर्ज करें; यह चैट रीलोड पर मिट जाती है।" : "Asking does not change your case. Record important answers; this chat clears on reload."}</p>
            </section>
          )}

                  <details className="mt-4 border-t border-[var(--line)] pt-2 text-sm">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-[#65716b]">{locale === "hi" ? "यह कदम सहेजें या साझा करें" : "Save or share this step"}</summary>
                    <p className="mb-2 text-sm text-[#65716b]">{locale === "hi" ? "अपने पास रखने के लिए इस कदम की तैयारी की कॉपी लें।" : "Take a copy of these instructions to use away from Sahayak."}</p>
                    <div className="flex flex-wrap gap-3">
                      <button ref={briefButton} type="button" className="min-h-11 rounded-lg border border-[var(--green)] px-4 font-semibold text-[var(--green)] disabled:opacity-50" disabled={briefPending} onClick={() => void keepNextStep("preview")}>{locale === "hi" ? "देखें / प्रिंट करें" : "Preview / print brief"}</button>
                      {canShare && <button type="button" className="min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--green)] disabled:opacity-50" disabled={briefPending} onClick={() => void keepNextStep("share")}>{locale === "hi" ? "साझा करें" : "Share instructions"}</button>}
                      <button type="button" className="min-h-11 rounded-lg border border-[var(--line)] px-4 font-semibold text-[var(--green)] disabled:opacity-50" disabled={briefPending} onClick={() => void keepNextStep("download")}>{briefPending ? (locale === "hi" ? "तैयार हो रहा है…" : "Preparing…") : (locale === "hi" ? "फ़ाइल डाउनलोड करें" : "Download instructions")}</button>
                    </div>
                  </details>
                  {artifactPanel && <details ref={documentsPanel} className="mt-4 border-t border-[var(--line)] pt-2">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--green)]">{locale === "hi" ? "दस्तावेज़ और मसौदे" : "Documents and drafts"} · {caseSnapshot.artifacts.length}</summary>
                    {artifactPanel}
                  </details>}
                </>
              ) : waiting ? (
                <p
                  className="m-0 mt-3 flex flex-wrap items-center gap-2 rounded-[14px] bg-[#fff2ce] p-3 text-[.82rem] leading-[1.45] text-[#7a530a]"
                  role="status"
                >
                  <span className="size-2.5 shrink-0 rounded-full bg-[#b8801a] animate-waiting-pulse motion-reduce:animate-none" />
                  {text("case.waiting")}
                  <em className="w-full not-italic text-[.72rem] text-[#8a6417]">
                    {text("case.waitingNote")}
                  </em>
                </p>
              ) : (
                <p className="m-0 font-bold">{text("case.allDone")}</p>
              )}

              {!current && artifactPanel}

              {feedback && (
                <p
                  className="m-0 mt-3 flex items-center gap-1.5 rounded-[10px] bg-[#f2f6f3] px-3 py-2.5 text-[.92rem] text-[#33413a]"
                  role="status"
                >
                  {feedback}
                  <button
                    className="min-h-9 border-0 bg-transparent px-2 py-1 text-[.8rem] font-bold text-[var(--green)]"
                    type="button"
                    onClick={() => void speak(feedback)}
                    aria-label={text("action.listenLabel")}
                  >
                    🔊
                  </button>
                </p>
              )}


              {caseId && resolved && (
                <ResolutionOutcomeForm caseId={caseId} locale={locale} />
              )}
            </section>

              {caseId && reportStepId && (
                <details className="mt-5 border-t border-[var(--line)] pt-4">
                  <summary className="min-h-11 cursor-pointer text-sm font-semibold text-[#536059]">{locale === "hi" ? "पिछले कदम पर जानकारी दें" : "Feedback on the previous step"}</summary>
                <StepOutcomeForm
                  key={`${reportStepId}-${caseSnapshot.nodes.find((node) => node.id === reportStepId)?.state}`}
                  completed={
                    caseSnapshot.nodes.find((node) => node.id === reportStepId)
                      ?.state === "done"
                  }
                  caseId={caseId}
                  stepId={reportStepId}
                  stepTitle={reportStepTitle}
                  locale={locale}
                />
                </details>
              )}

            <details className="mt-6 border-t border-[var(--line)] pt-4">
            <summary className="min-h-11 cursor-pointer font-semibold text-[var(--green)]">{text("case.history")}</summary>
            <ol className="m-[22px_0px_0px] list-none p-0">
              {caseSnapshot.nodes.map((node) => {
                const definition = workflow.nodes.find(
                  (candidate) => candidate.id === node.id
                );
                if (!definition) return null;
                const note = nodeNote(caseSnapshot, node.id);

                return (
                  <li
                    key={node.id}
                    className={`flex gap-3 py-2.5 ${TIMELINE_TEXT_CLASS[node.state] ?? "text-[#7a827e]"}`}
                  >
                    <span
                      className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${TIMELINE_DOT_CLASS[node.state] ?? "border-current"}`}
                    />
                    <details className="min-w-0 grow shrink basis-auto">
                      <summary className="block min-h-11 list-none py-0.5 cursor-pointer [&::-webkit-details-marker]:hidden focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--marigold)]">
                        <strong className="block">
                          {translate(definition.title, locale)}
                        </strong>
                        <small className="mt-[3px] block text-[.72rem]">
                          {text(`state.${node.state}`)}
                        </small>
                      </summary>
                      <p className="m-[6px_0px_0px] text-[.86rem] leading-[1.5] text-[#536059]">
                        {translate(definition.detail, locale) !==
                        translate(definition.title, locale)
                          ? translate(definition.detail, locale)
                          : null}
                      </p>
                      {note && (
                        <p className="m-[8px_0px_0px] border-l-[3px] border-[#8b2e24] bg-[#fbeceb] px-2.5 py-2 text-[.82rem] font-bold text-[#8b2e24]">
                          {translate(note, locale)}
                        </p>
                      )}
                      {definition.link && (
                        <p className="m-[6px_0px_0px]">
                          <a
                            className="font-bold text-[var(--green)]"
                            href={definition.link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {text("web.open")}
                          </a>
                        </p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ol>
            </details>

            {caseId && (
              <a
                className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--green)] underline underline-offset-4"
                href={caseCardHref(caseId)}
              >
                {text("case.openCaseCard")}
              </a>
            )}

            <button
              className="mt-3 block min-h-11 text-sm font-medium text-[#65716b] underline underline-offset-4"
              type="button"
              onClick={resetDemo}
            >
              {text("case.startOver")}
            </button>
          </section>


        </>
      )}
      <footer className="mt-10 border-t border-[var(--line)] pt-4">
        <a href="/about" className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--green)] underline underline-offset-4">
          {locale === "hi" ? "सहायक के बारे में" : "About Sahayak"}
        </a>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
