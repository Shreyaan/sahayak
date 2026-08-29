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
    <div className="language-switcher" role="group" aria-label="Language">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          disabled={pending}
          aria-pressed={locale === active}
          className={locale === active ? "active" : ""}
          onClick={() => startTransition(() => void changeLocale(locale))}
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
