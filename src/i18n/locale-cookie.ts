"use server";

import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, localeFromAcceptLanguage, type Locale } from "@/lib/locale";

const COOKIE = "SAHAYAK_LOCALE";

/**
 * The chosen language, or the best match for the browser's own preference on a
 * first visit, so a reader who cannot read Hindi is not stranded.
 */
export async function getLocale(): Promise<Locale> {
  const stored = (await cookies()).get(COOKIE)?.value;
  if (isLocale(stored)) return stored;

  const accepted = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(accepted) ?? defaultLocale;
}

export async function setLocale(locale: Locale): Promise<void> {
  (await cookies()).set(COOKIE, locale, {
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    path: "/",
  });
}
