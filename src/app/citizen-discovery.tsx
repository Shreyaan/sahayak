"use client";

import { useMutation } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { SearchWorkflowsResponse } from "@/lib/search/search-workflows";
import { isSyntheticSeed } from "@/lib/workflow";
import { formatJurisdiction } from "@/lib/trust";
import { TrustDisclosure } from "./trust-disclosure";

const copy = {
  en: {
    label: "What do you need help with?",
    placeholder:
      "For example: My scholarship shows released, but no money reached my bank…",
    searchAction: "Search",
    answerLabel: "Your answer",
    answerPlaceholder: "Add one detail…",
    resultHeading: "Matching journeys",
    start: "Start this journey",
    searching: "Looking for a match…",
    error: "Search is unavailable right now. Your description is still here.",
    unsupported: "Sorry — Sahayak can't help with this one right now.",
    unsupportedHelp:
      "It only gives a next step when it has a checked journey for that problem. Rather than guess, it says no. Your description is still here — see what it can help with below, or send it to Contribute to get it added. No case has been started.",
  },
  hi: {
    label: "आपको किस काम में मदद चाहिए?",
    placeholder:
      "जैसे: छात्रवृत्ति जारी दिख रही है, लेकिन बैंक में पैसा नहीं आया…",
    searchAction: "खोजें",
    answerLabel: "आपका जवाब",
    answerPlaceholder: "एक जानकारी और जोड़ें…",
    resultHeading: "मिलती-जुलती यात्राएँ",
    start: "यह यात्रा शुरू करें",
    searching: "सही यात्रा खोज रहे हैं…",
    error: "अभी खोज उपलब्ध नहीं है। आपकी लिखी समस्या यहीं सुरक्षित है।",
    unsupported: "क्षमा करें — सहायक अभी इस काम में मदद नहीं कर सकता।",
    unsupportedHelp:
      "सहायक अगला कदम तभी बताता है जब उसके पास जाँची हुई यात्रा हो। अंदाज़ा लगाने से बेहतर है साफ़ मना करना। आपका विवरण यहीं सुरक्षित है — नीचे देखें किन कामों में मदद मिल सकती है, या योगदान से इसे जुड़वाइए। कोई केस शुरू नहीं हुआ है।",
  },
} as const;

async function requestSearch(
  query: string,
  locale: Locale,
  stateCode?: string,
  districtCode?: string,
  clarificationAttempt = 0
): Promise<SearchWorkflowsResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query,
      locale,
      stateCode,
      districtCode,
      limit: 3,
      clarificationAttempt,
    }),
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
  const [problem, setProblem] = useState("");
  const [answer, setAnswer] = useState("");
  const [response, setResponse] = useState<SearchWorkflowsResponse>();
  const [startingVersionId, setStartingVersionId] = useState<string>();
  const starting = useRef(false);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  useEffect(() => setConfirmed([]), [response]);
  const searchRevision = useRef(0);
  const search = useMutation({
    mutationFn: ({
      query,
      clarificationAttempt,
    }: {
      query: string;
      clarificationAttempt: number;
      revision: number;
    }) =>
      requestSearch(
        query,
        locale,
        stateCode,
        districtCode,
        clarificationAttempt
      ),
    onSuccess: (next, input) => {
      if (input.revision !== searchRevision.current) return;
      setResponse(next);
    },
  });

  useEffect(() => {
    // A result belongs to the scope and language that produced it. Keep the words,
    // but invalidate both displayed results and any outstanding response.
    searchRevision.current += 1;
    setResponse(undefined);
    setAnswer("");
  }, [stateCode, districtCode, locale]);

  function chooseExample(query: string) {
    setProblem(query);
    setAnswer("");
    setResponse(undefined);
    searchRevision.current += 1;
    search.mutate({ query, clarificationAttempt: 0, revision: searchRevision.current });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const query = [problem.trim(), answer.trim()].filter(Boolean).join(". ");
    if (query.length >= 2)
      search.mutate({
        query,
        clarificationAttempt: answer.trim() ? 1 : 0,
        revision: searchRevision.current,
      });
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
      <div className="flex flex-wrap gap-2" aria-label={locale === "hi" ? "आम समस्याएँ" : "Common problems"}>
        {(locale === "hi"
          ? ["छात्रवृत्ति का पैसा नहीं आया", "आधार अपडेट अटका है", "PF निकासी अटकी है"]
          : ["Scholarship money hasn’t arrived", "Aadhaar update is stuck", "PF withdrawal is stuck"]
        ).map((example) => <button key={example} type="button" disabled={search.isPending}
          className="min-h-11 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-left text-sm font-semibold text-[var(--green)] hover:bg-[#edf4ee] disabled:opacity-50"
          onClick={() => chooseExample(example)}>{example}</button>)}
      </div>
      <form className="grid gap-2.5" onSubmit={submit}>
        <label className="text-sm font-extrabold" htmlFor="citizen-problem">
          {text.label}
        </label>
        <textarea
          className="min-h-[76px] w-full resize-y rounded-2xl border border-[var(--line)] bg-white p-3.5 leading-normal text-[var(--ink)]"
          id="citizen-problem"
          value={problem}
          onChange={(event) => {
            setProblem(event.target.value);
            setAnswer("");
            setResponse(undefined);
            searchRevision.current += 1;
          }}
          placeholder={text.placeholder}
          rows={2}
          maxLength={500}
        />

        {response?.shouldClarify && response.clarificationQuestion && (
          <div
            className="grid gap-2 rounded-xl border-l-4 border-[var(--marigold)] bg-[#fff8e8] p-3.5"
            role="status"
          >
            <p className="mb-1 font-extrabold leading-snug">
              {response.clarificationQuestion}
            </p>
            <label
              className="text-sm font-extrabold"
              htmlFor="clarification-answer"
            >
              {text.answerLabel}
            </label>
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

        <button
          className="min-h-11 justify-self-end rounded-xl bg-[var(--marigold)] px-6 py-2.5 font-extrabold text-[#2f250f] disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full"
          disabled={search.isPending || problem.trim().length < 2}
          type="submit"
        >
          {search.isPending
            ? text.searching
            : text.searchAction}
        </button>
      </form>

      {search.isError && (
        <p className="m-0 font-bold text-[#8b2e24]" role="alert">
          {text.error}
        </p>
      )}

      {response?.unsupported && (
        <div
          className="rounded-xl border border-[var(--line)] bg-[#fff8e8] p-4"
          role="status"
        >
          <p className="m-0 font-extrabold">{text.unsupported}</p>
          <p className="mb-0 mt-2 text-sm leading-relaxed">
            {text.unsupportedHelp}
          </p>
        </div>
      )}

      {response && !response.shouldClarify && response.results.length > 0 && (
        <div className="grid gap-3">
          <h2 className="mt-1 text-lg font-bold" id="discovery-heading">
            {text.resultHeading}
          </h2>
          {response.results.map((result) => (
            <article
              key={result.workflowVersionId}
              className="grid gap-1 rounded-[18px] border border-[var(--line)] bg-white/70 p-4 text-left shadow-[0_8px_24px_rgba(52,43,27,.05)]"
            >
              <strong className="text-lg">{result.title}</strong>
              <small className="text-[#7a827e]">{result.summary}</small>
              <span className="mt-1 w-fit rounded-full bg-[#e8f4ee] px-2 py-1 text-xs font-extrabold text-[var(--green)]">
                {formatJurisdiction(result.jurisdiction, locale)}
              </span>
              {/* {isSyntheticSeed(result.workflowId) && (
                <span className="w-fit rounded-full bg-[#fff1cf] px-2 py-1 text-xs font-extrabold text-[#79540d]">
                  {locale === "hi"
                    ? "कृत्रिम उदाहरण यात्रा"
                    : "Synthetic example journey"}
                </span>
              )} */}
              <ul className="mt-1 list-disc pl-4 text-sm text-[#536059]">
                {result.matchReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {result.requiresConfirmation && <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={confirmed.includes(result.workflowVersionId)} onChange={event => setConfirmed(current => event.target.checked ? [...current, result.workflowVersionId] : current.filter(id => id !== result.workflowVersionId))} />
                {locale === "hi" ? "हाँ, यह मेरी समस्या है" : "Yes, this describes my situation"}
              </label>}
              <button
                className="mt-2 min-h-11 rounded-xl bg-(--marigold) font-extrabold text-[#2f250f] disabled:opacity-50"
                type="button"
                disabled={starting.current || (result.requiresConfirmation && !confirmed.includes(result.workflowVersionId))}
                onClick={() => void startResult(result.workflowVersionId)}
              >
                {startingVersionId === result.workflowVersionId
                  ? text.searching
                  : text.start}
              </button>
              <TrustDisclosure
                trust={result.trust}
                jurisdiction={result.jurisdiction}
                locale={locale}
              />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
