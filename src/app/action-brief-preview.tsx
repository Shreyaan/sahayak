"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Locale } from "@/lib/locale";

export function ActionBriefPreview({ content, locale, onClose }: { content: string; locale: Locale; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(
    <dialog ref={dialog} data-action-brief aria-labelledby="brief-title" onClose={onClose}
      className="m-auto max-h-[90dvh] w-[min(48rem,calc(100%-2rem))] overflow-auto rounded-xl border border-[var(--line)] bg-white p-5 text-[var(--ink)] backdrop:bg-black/40">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 id="brief-title" className="text-xl font-bold">{locale === "hi" ? "साथ ले जाने के लिए तैयारी" : "Your take-along brief"}</h2>
        <div className="flex gap-2">
          <button type="button" className="min-h-11 rounded-lg bg-[var(--green)] px-4 font-bold text-white" onClick={() => window.print()}>{locale === "hi" ? "प्रिंट करें" : "Print"}</button>
          <button type="button" className="min-h-11 rounded-lg border border-[var(--line)] px-4" onClick={() => dialog.current?.close()}>{locale === "hi" ? "बंद करें" : "Close"}</button>
        </div>
      </div>
      <p className="mb-4 text-sm text-[#65716b] print:hidden">{locale === "hi" ? "साझा या प्रिंट करने से पहले दर्ज निजी जानकारी जाँच लें।" : "Check your recorded details before sharing or printing."}</p>
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{content}</pre>
    </dialog>, document.body,
  );
}
