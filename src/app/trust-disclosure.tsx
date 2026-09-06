import type { Locale } from "@/lib/locale";
import { formatJurisdiction, formatReviewDate, type TrustMetadata, type WorkflowJurisdiction } from "@/lib/trust";

const copy = {
  en: {
    title: "Why trust this?",
    provenance: "Provenance",
    provenanceValue: { "official-source-reviewed": "Official source reviewed", "legacy-verification-pending": "Verification pending" },
    scope: "Jurisdiction / scope",
    reviewDate: "Review date",
    verification: "Verification method",
    expertSupport: "Current expert supports",
    sources: "Source links",
    disagreement: "Warning: an unresolved expert disagreement is recorded for this guidance.",
  },
  hi: {
    title: "इस पर भरोसा क्यों करें?",
    provenance: "मूल",
    provenanceValue: { "official-source-reviewed": "आधिकारिक स्रोत की समीक्षा हुई", "legacy-verification-pending": "सत्यापन लंबित है" },
    scope: "क्षेत्र / दायरा",
    reviewDate: "समीक्षा की तारीख",
    verification: "सत्यापन का तरीका",
    expertSupport: "मौजूदा विशेषज्ञ समर्थन",
    sources: "स्रोत लिंक",
    disagreement: "चेतावनी: इस मार्गदर्शन पर विशेषज्ञों की असुलझी असहमति दर्ज है।",
  },
} as const;

export function TrustDisclosure({ trust, jurisdiction, locale }: { trust: TrustMetadata; jurisdiction: WorkflowJurisdiction; locale: Locale }) {
  const text = copy[locale];
  const verification = locale === "hi"
    ? trust.provenance === "official-source-reviewed"
      ? "सार्वजनिक आधिकारिक स्रोतों के आधार पर तैयार प्रोटोटाइप मार्गदर्शन।"
      : "इस पुराने कार्यप्रवाह संस्करण का सत्यापन लंबित है।"
    : trust.verificationMethod;

  return (
    <details className="mt-2.5 text-[#536059] text-[.8rem]">
      <summary className="cursor-pointer text-[var(--green)] font-extrabold">{text.title}</summary>
      <dl className="mt-2">
        <dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.provenance}</dt><dd className="mt-0.5 leading-[1.45]">{text.provenanceValue[trust.provenance]}</dd>
        <dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.scope}</dt><dd className="mt-0.5 leading-[1.45]">{formatJurisdiction(jurisdiction, locale)}</dd>
        <dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.reviewDate}</dt><dd className="mt-0.5 leading-[1.45]">{formatReviewDate(trust.reviewDate, locale)}</dd>
        <dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.verification}</dt><dd className="mt-0.5 leading-[1.45]">{verification}</dd>
        <dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.expertSupport}</dt><dd className="mt-0.5 leading-[1.45]">{trust.currentExpertSupportCount}</dd>
        {trust.sourceLinks.length > 0 && <><dt className="mt-[7px] text-[var(--green)] text-[.72rem] font-extrabold">{text.sources}</dt>
        <dd className="mt-0.5 leading-[1.45]"><ul className="mt-1 pl-[18px]">{trust.sourceLinks.map((source) => (
          <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
        ))}</ul></dd></>}
      </dl>
      {trust.hasUnresolvedDisagreement && <p className="mt-2.5 text-[#7c2b21] font-extrabold" role="alert">{text.disagreement}</p>}
    </details>
  );
}
