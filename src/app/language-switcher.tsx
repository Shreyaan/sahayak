"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { locales, localeNames, type Locale } from "@/lib/locale";
import { changeLocale } from "./locale-action";

/** Always visible, so a reader who cannot read the current language can switch. */
export function LanguageSwitcher() {
  const active = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  return (
    <div className="inline-flex gap-0.5 p-0.5 rounded-full border border-[var(--line,#d8ded8)] bg-white" role="group" aria-label="Language">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          disabled={pending}
          aria-pressed={locale === active}
          className="min-h-11 px-3 py-1.5 border-0 rounded-full bg-transparent text-[#4a5450] text-[.74rem] font-semibold aria-pressed:bg-[var(--green,#1f6f4a)] aria-pressed:text-white disabled:opacity-60"
          onClick={() => startTransition(() => void changeLocale(locale))}
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
