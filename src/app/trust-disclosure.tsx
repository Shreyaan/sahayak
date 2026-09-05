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
    <details className="trust-disclosure">
      <summary>{text.title}</summary>
      <dl>
        <dt>{text.provenance}</dt><dd>{text.provenanceValue[trust.provenance]}</dd>
        <dt>{text.scope}</dt><dd>{formatJurisdiction(jurisdiction, locale)}</dd>
        <dt>{text.reviewDate}</dt><dd>{formatReviewDate(trust.reviewDate, locale)}</dd>
        <dt>{text.verification}</dt><dd>{verification}</dd>
        <dt>{text.expertSupport}</dt><dd>{trust.currentExpertSupportCount}</dd>
        {trust.sourceLinks.length > 0 && <><dt>{text.sources}</dt>
        <dd><ul>{trust.sourceLinks.map((source) => (
          <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a></li>
        ))}</ul></dd></>}
      </dl>
      {trust.hasUnresolvedDisagreement && <p className="trust-warning" role="alert">{text.disagreement}</p>}
    </details>
  );
}
