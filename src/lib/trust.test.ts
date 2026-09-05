import { describe, expect, test } from "bun:test";
import { formatJurisdiction, formatReviewDate, parseTrustMetadata, trustMetadataSchema } from "./trust";
import { isSafePublicUrl } from "./public-url";

describe("trustMetadataSchema", () => {
  test("accepts a public HTTPS source link and rejects private or insecure sources", () => {
    const base = {
      provenance: "official-source-reviewed",
      reviewDate: "2026-09-04",
      verificationMethod: "Seeded prototype guidance checked against public official sources.",
      currentExpertSupportCount: 0,
      hasUnresolvedDisagreement: false,
    };

    expect(trustMetadataSchema.safeParse({
      ...base,
      sourceLinks: [{ label: "National Scholarships Portal", url: "https://scholarships.gov.in/" }],
    }).success).toBe(true);
    expect(trustMetadataSchema.safeParse({
      ...base,
      sourceLinks: [{ label: "Private", url: "https://127.0.0.1/admin" }],
    }).success).toBe(false);
    expect(trustMetadataSchema.safeParse({
      ...base,
      sourceLinks: [{ label: "Insecure", url: "http://example.com" }],
    }).success).toBe(false);
    expect(trustMetadataSchema.safeParse({ ...base, sourceLinks: [] }).success).toBe(true);
  });

  test.each([
    "https://example.com.",
    "https://8.8.8.8/",
  ])("accepts public URL %s", (url) => expect(isSafePublicUrl(url)).toBe(true));

  test.each([
    "https://100.64.0.1/", "https://198.18.0.1/", "https://224.0.0.1/",
    "https://192.0.2.1/", "https://[::1]/", "https://[fe80::1]/", "https://[fc00::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[ff02::1]/", "https://[100::1]/", "https://[2001:2::1]/", "https://[2001:10::1]/",
  ])("rejects non-public URL %s", (url) => expect(isSafePublicUrl(url)).toBe(false));

  test("rejects malformed database trust before a route can expose it", () => {
    expect(() => parseTrustMetadata({ sourceLinks: [{ label: "Unsafe", url: "https://127.0.0.1/" }] }))
      .toThrow("WORKFLOW_TRUST_INVALID");
  });

  test("formats pending dates and structured jurisdiction in Hindi", () => {
    expect(formatReviewDate(null, "hi")).toBe("अभी समीक्षा नहीं हुई");
    expect(formatReviewDate("2026-09-04", "en")).toContain("Sep");
    expect(formatJurisdiction({ scope: "district", stateCode: "MH", districtCode: "Pune" }, "hi"))
      .toBe("जिला · MH · Pune");
  });
});
