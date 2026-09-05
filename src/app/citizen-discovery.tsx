"use client";

import { useMutation } from "@tanstack/react-query";
import { FormEvent, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { SearchWorkflowsResponse } from "@/lib/search/search-workflows";
import { formatJurisdiction } from "@/lib/trust";
import { TrustDisclosure } from "./trust-disclosure";

type Mode = "search" | "chat";

const copy = {
  en: {
    label: "Describe your problem",
    placeholder: "For example: My scholarship shows released, but no money reached my bank…",
    search: "Search",
    chat: "Chat",
    searchAction: "Search journeys",
    chatAction: "Continue in Chat",
    answerLabel: "Your answer",
    answerPlaceholder: "Add one detail…",
    resultHeading: "Matching journeys",
    start: "Start this journey",
    searching: "Looking for a safe match…",
    error: "Search is unavailable right now. Your description is still here.",
  },
  hi: {
    label: "अपनी समस्या बताइए",
    placeholder: "जैसे: छात्रवृत्ति जारी दिख रही है, लेकिन बैंक में पैसा नहीं आया…",
    search: "खोजें",
    chat: "बात करें",
    searchAction: "यात्रा खोजें",
    chatAction: "बातचीत जारी रखें",
    answerLabel: "आपका जवाब",
    answerPlaceholder: "एक जानकारी और जोड़ें…",
    resultHeading: "मिलती-जुलती यात्राएँ",
    start: "यह यात्रा शुरू करें",
    searching: "सही यात्रा खोज रहे हैं…",
    error: "अभी खोज उपलब्ध नहीं है। आपकी लिखी समस्या यहीं सुरक्षित है।",
  },
} as const;

async function requestSearch(query: string, locale: Locale, stateCode?: string, districtCode?: string): Promise<SearchWorkflowsResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, locale, stateCode, districtCode, limit: 3 }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.code ?? "SEARCH_UNAVAILABLE");
  return body;
}

export function CitizenDiscovery({
  locale,
  stateCode,
  districtCode,
  onStart,
}: {
  locale: Locale;
  stateCode?: string;
  districtCode?: string;
  onStart: (workflowVersionId: string) => Promise<void>;
}) {
  const text = copy[locale];
  const [mode, setMode] = useState<Mode>("search");
  const [problem, setProblem] = useState("");
  const [answer, setAnswer] = useState("");
  const [response, setResponse] = useState<SearchWorkflowsResponse>();
  const [startingVersionId, setStartingVersionId] = useState<string>();
  const starting = useRef(false);
  const search = useMutation({
    mutationFn: (query: string) => requestSearch(query, locale, stateCode, districtCode),
    onSuccess: (next) => {
      setResponse(next);
      if (next.shouldClarify) setMode("chat");
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = [problem.trim(), answer.trim()].filter(Boolean).join(". ");
    if (query.length >= 2) search.mutate(query);
  }

  async function startResult(workflowVersionId: string) {
    if (starting.current) return;
    starting.current = true;
    setStartingVersionId(workflowVersionId);
    try {
      await onStart(workflowVersionId);
    } finally {
      starting.current = false;
      setStartingVersionId(undefined);
    }
  }

  return (
    <section className="grid gap-4" aria-label={text.label}>
      <div className="grid w-full max-w-48 grid-cols-2 gap-0.5 rounded-lg border border-[var(--line)] bg-[#f7f3ec] p-0.5" role="tablist" aria-label="Discovery mode">
        <button className="min-h-8 rounded-[9px] px-3 py-1 text-sm font-extrabold text-[var(--green)] aria-selected:bg-[var(--green)] aria-selected:text-white" type="button" role="tab" aria-selected={mode === "search"} onClick={() => setMode("search")}>
          {text.search}
        </button>
        <button className="min-h-8 rounded-[9px] px-3 py-1 text-sm font-extrabold text-[var(--green)] aria-selected:bg-[var(--green)] aria-selected:text-white" type="button" role="tab" aria-selected={mode === "chat"} onClick={() => setMode("chat")}>
          {text.chat}
        </button>
      </div>

      <form className="grid gap-2.5" onSubmit={submit}>
        <label className="text-sm font-extrabold" htmlFor="citizen-problem">{text.label}</label>
        <textarea
          className="min-h-[76px] w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-3.5 leading-normal text-[var(--ink)]"
          id="citizen-problem"
          value={problem}
          onChange={(event) => setProblem(event.target.value)}
          placeholder={text.placeholder}
          rows={2}
          maxLength={500}
        />

        {mode === "chat" && response?.clarificationQuestion && (
          <div className="grid gap-2 rounded-xl border-l-4 border-[var(--marigold)] bg-[#fff8e8] p-3.5" role="status">
            <p className="mb-1 font-extrabold leading-snug">{response.clarificationQuestion}</p>
            <label className="text-sm font-extrabold" htmlFor="clarification-answer">{text.answerLabel}</label>
            <input
              className="w-full rounded-2xl border border-[var(--line)] bg-white p-3.5 leading-normal text-[var(--ink)]"
              id="clarification-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder={text.answerPlaceholder}
              maxLength={300}
            />
          </div>
        )}

        <button className="min-h-11 justify-self-end rounded-xl bg-[var(--marigold)] px-6 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full" disabled={search.isPending || problem.trim().length < 2} type="submit">
          {search.isPending ? text.searching : mode === "search" ? text.searchAction : text.chatAction}
        </button>
      </form>

      {search.isError && <p className="m-0 font-bold text-[#8b2e24]" role="alert">{text.error}</p>}

      {response && !response.shouldClarify && response.results.length > 0 && (
        <div className="grid gap-3">
          <h2 className="mt-1 text-lg font-bold" id="discovery-heading">{text.resultHeading}</h2>
          {response.results.map((result) => (
            <article key={result.workflowVersionId} className="grid gap-1 rounded-[18px] border border-[var(--line)] bg-white/70 p-4 text-left shadow-[0_8px_24px_rgba(52,43,27,.05)]">
              <strong className="text-lg">{result.title}</strong>
              <small className="text-[#7a827e]">{result.summary}</small>
              <span className="mt-1 w-fit rounded-full bg-[#e8f4ee] px-2 py-1 text-xs font-extrabold text-[var(--green)]">{formatJurisdiction(result.jurisdiction, locale)}</span>
              <ul className="mt-1 list-disc pl-4 text-sm text-[#536059]">{result.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <button className="mt-2 min-h-11 rounded-xl bg-[var(--marigold)] font-extrabold text-[#2f250f] disabled:opacity-50" type="button" disabled={starting.current} onClick={() => void startResult(result.workflowVersionId)}>
                {startingVersionId === result.workflowVersionId ? text.searching : text.start}
              </button>
              <TrustDisclosure trust={result.trust} jurisdiction={result.jurisdiction} locale={locale} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
