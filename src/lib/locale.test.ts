import { describe, expect, test } from "bun:test";
import { isLocale, localeFromAcceptLanguage, t, type Locale } from "./locale";

describe("locale", () => {
  test.each([
    ["hi", "hi"],
    ["en-GB,en;q=0.9", "en"],
    ["hi-IN,hi;q=0.9,en-US;q=0.8", "hi"],
    ["en-US,en;q=0.9,hi;q=0.8", "en"],
    ["fr-FR,fr;q=0.9", "en"],
    [null, "hi"],
  ] as Array<[string | null, Locale]>)("reads %s as %s", (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  test("prefers the higher quality language regardless of order", () => {
    expect(localeFromAcceptLanguage("en;q=0.2,hi;q=0.9")).toBe("hi");
  });

  test("reads a localized string and falls back when a language is missing", () => {
    expect(t({ hi: "नमस्ते", en: "Hello" }, "en")).toBe("Hello");
    expect(t({ hi: "नमस्ते", en: undefined as unknown as string }, "en")).toBe("नमस्ते");
  });

  test.each(["hi", "en"])("accepts the supported locale %s", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  test.each(["fr", "", "HI", null, 7])("rejects %s", (value) => {
    expect(isLocale(value)).toBe(false);
  });
});
