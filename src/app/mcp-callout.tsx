"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function McpCallout({ compact = false }: { compact?: boolean }) {
  const contributorText = useTranslations("citizen.contributor.ai");
  const homeText = useTranslations("citizen.home.ai");
  const text = compact ? homeText : contributorText;
  const [endpoint, setEndpoint] = useState("/mcp");
  const [copied, setCopied] = useState(false);

  useEffect(() => setEndpoint(window.location.origin === "null" ? "/mcp" : `${window.location.origin}/mcp`), []);

  async function copy() {
    await navigator.clipboard.writeText(endpoint);
    setCopied(true);
  }

  return <aside className={compact ? "mt-8 border-t border-[var(--line)] py-7" : "rounded-[22px] border border-[#a8bdae] bg-[#edf4ee]/70 p-6"} aria-labelledby={compact ? "home-mcp-heading" : "mcp-heading"}>
    <p className="m-0 text-xs font-extrabold uppercase tracking-[.12em] text-[var(--green)]">MCP</p>
    <h2 className={`${compact ? "text-2xl" : "text-xl"} mt-1 font-bold`} id={compact ? "home-mcp-heading" : "mcp-heading"}>{text("title")}</h2>
    <p className={`${compact ? "text-base" : "text-sm"} mt-2 max-w-2xl leading-relaxed text-[#425149]`}>{text("copy")}</p>
    <strong className="mt-2 block text-sm text-[var(--green)]">{text("reviewOnly")}</strong>
    <div className={`mt-3.5 grid items-end gap-2 ${compact ? "grid-cols-[1fr_auto] max-lg:grid-cols-1" : "grid-cols-1"}`}>
      <div>
        <label className="text-xs font-extrabold text-[#425149]" htmlFor={compact ? "home-mcp-endpoint" : "mcp-endpoint"}>{text("endpointLabel")}</label>
        <input className="mt-1 block min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 font-mono text-xs text-[var(--ink)]" id={compact ? "home-mcp-endpoint" : "mcp-endpoint"} value={endpoint} readOnly />
      </div>
      <button type="button" className={`min-h-11 rounded-xl bg-[#eee5d8] px-3.5 py-2.5 font-extrabold text-[var(--green)] ${compact ? "max-lg:w-full" : "w-full"}`} onClick={() => void copy()}>{copied ? text("copied") : text("copyButton")}</button>
    </div>
  </aside>;
}
