"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import { demoProfile } from "@/lib/demo-profile";

export function DemoDetails({ locale }: { locale: Locale }) {
  const [loaded, setLoaded] = useState(false);
  const hi = locale === "hi";
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => panel.current?.showModal()}
        className="min-h-11 px-1 text-[.82rem] font-medium text-[#65716b] hover:text-[var(--green)]"
      >
        {hi ? "आपका विवरण" : "Your details"}
      </button>
      <dialog
        ref={panel}
        aria-labelledby="your-details-title"
        onClose={() => trigger.current?.focus()}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[400px] overflow-y-auto border-0 border-l border-[var(--line)] bg-[var(--paper,#f6f0e6)] p-5 text-left text-[var(--ink)] shadow-xl backdrop:bg-black/30"
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => panel.current?.close()}
            className="min-h-11 rounded-lg border border-[var(--line)] px-3 text-sm font-medium"
          >
            {hi ? "बंद करें" : "Close"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <h2 id="your-details-title" className="text-lg font-bold">
            {hi ? "आपका विवरण" : "Your details"}
          </h2>
          <span className="rounded-md bg-[#eee5d8] px-2 py-1 text-xs font-semibold text-[#735c37]">
            {hi ? "सिर्फ़ डेमो" : "Demo only"}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#536059]">
          {hi ? "नमूना पहचान-पत्र देखें। " : "Try sample ID cards"}
        </p>
        {loaded ? (
          <>
            <div className="mt-4 grid gap-3">
              {demoProfile.documents.map((document) => (
                <div
                  key={document.number}
                  className="rounded-xl border border-[var(--line)] bg-white p-4"
                >
                  <h3 className="font-bold">
                    {document.name[locale]}{" "}
                    <span className="font-normal text-[#65716b]">
                      · {hi ? "नमूना" : "Sample"}
                    </span>
                  </h3>
                  <p className="mt-2 text-sm">{demoProfile.name[locale]}</p>
                  <p className="mt-1 font-mono text-sm tracking-wider text-[#536059]">
                    {document.number}
                  </p>
                  <p className="mt-2 text-xs text-[#65716b]">
                    {hi
                      ? "पहचान के प्रमाण के रूप में मान्य नहीं"
                      : "Not valid as identity proof"}
                  </p>
                </div>
              ))}
            </div>
            <p role="status" className="mt-3 text-sm text-[#536059]">
              {hi
                ? "नमूने इस ब्राउज़र में दिखाए गए हैं। शिकायत फ़ॉर्म में ‘डेमो नाम इस्तेमाल करें’ चुन सकते हैं; पहचान संख्या नहीं भरी जाएगी।"
                : "Samples are displayed in this browser. Choose ‘Use demo name’ in the grievance form; ID numbers won’t be filled in."}
            </p>
            <button
              type="button"
              onClick={() => setLoaded(false)}
              className="mt-2 min-h-11 text-sm font-semibold text-[var(--green)] underline"
            >
              {hi ? "नमूने हटाएँ" : "Clear samples"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setLoaded(true)}
            className="mt-3 min-h-11 rounded-lg border border-[var(--green)] px-4 text-sm font-semibold text-[var(--green)]"
          >
            {hi ? "डेमो पहचान-पत्र दिखाएँ" : "Load demo IDs"}
          </button>
        )}
      </dialog>
    </>
  );
}
