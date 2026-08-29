export const locales = ["hi", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "hi";

/** A user-facing string in every supported language. */
export type Localized = Record<Locale, string>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Reads one language out of a localized string. */
export function t(value: Localized, locale: Locale): string {
  return value[locale] ?? value[defaultLocale];
}

/** Reads a localized list. */
export function tList(values: Localized[], locale: Locale): string[] {
  return values.map((value) => t(value, locale));
}

export const localeNames: Record<Locale, string> = {
  hi: "हिन्दी",
  en: "English",
};

/**
 * Deepgram Nova-3 language for this locale. Hindi speakers code-switch with
 * English constantly, so Hindi uses the multilingual model rather than `hi`.
 */
export const speechToTextLanguage: Record<Locale, string> = {
  hi: "multi",
  en: "en",
};

/** ElevenLabs language code, which sharpens pronunciation for the locale. */
export const textToSpeechLanguage: Record<Locale, string> = {
  hi: "hi",
  en: "en",
};

/** Picks a locale from an Accept-Language header, defaulting to Hindi. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale;

  const ordered = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params.find((entry) => entry.trim().startsWith("q="));
      return {
        tag: tag.trim().toLowerCase(),
        quality: quality ? Number(quality.split("=")[1]) || 0 : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ordered) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return "en";
}
