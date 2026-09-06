"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { artifactContent, renderArtifactBody } from "@/lib/artifacts";
import type { ArtifactDraft } from "@/lib/artifact-drafts";
import { t, type Locale } from "@/lib/locale";
import type { ArtifactId, CaseSnapshot } from "@/lib/workflow";
import { ArtifactDraftPanel } from "./case-card/artifact-draft-panel";

const copy = {
  en: {
    eyebrow: "Ready to use",
    heading: "Your documents",
    intro: "Prepare or download documents as soon as this journey makes them available.",
    download: "Download",
    fixed: "Approved journey guidance",
  },
  hi: {
    eyebrow: "उपयोग के लिए तैयार",
    heading: "आपके दस्तावेज़",
    intro: "यात्रा में उपलब्ध होते ही दस्तावेज़ तैयार करें या डाउनलोड करें।",
    download: "डाउनलोड करें",
    fixed: "स्वीकृत यात्रा मार्गदर्शन",
  },
} as const;

export function JourneyArtifacts({
  caseId,
  locale,
  snapshot,
  onDraftChange,
}: {
  caseId: string;
  locale: Locale;
  snapshot: CaseSnapshot;
  onDraftChange: (draft: ArtifactDraft) => void;
}) {
  const text = copy[locale];

  return (
    <section className="mt-6 border-t border-[var(--line)] pt-6" aria-labelledby="journey-documents-title">
      <p className="eyebrow">{text.eyebrow}</p>
      <h2 className="mb-0 mt-1 text-xl font-extrabold" id="journey-documents-title">{text.heading}</h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-[#536059]">{text.intro}</p>

      <div className="grid gap-4">
        {snapshot.artifacts.map((id) => (
          <ArtifactCard
            caseId={caseId}
            id={id}
            initialDraft={snapshot.artifactDrafts?.["escalation-draft"]}
            key={id}
            locale={locale}
            onDraftChange={onDraftChange}
            snapshot={snapshot}
          />
        ))}
      </div>
    </section>
  );
}

function ArtifactCard({
  caseId,
  id,
  initialDraft,
  locale,
  onDraftChange,
  snapshot,
}: {
  caseId: string;
  id: ArtifactId;
  initialDraft?: ArtifactDraft;
  locale: Locale;
  onDraftChange: (draft: ArtifactDraft) => void;
  snapshot: CaseSnapshot;
}) {
  const text = copy[locale];
  const artifact = artifactContent[id];

  return (
    <Card className="gap-0 border border-[var(--line)] bg-white py-0 shadow-none ring-0">
      <CardHeader className="gap-1 border-b border-[var(--line)] px-4 py-4 sm:px-5">
        <CardTitle className="text-base font-extrabold text-[var(--ink)]">{t(artifact.title, locale)}</CardTitle>
        <CardDescription className="text-sm leading-relaxed text-[#536059]">{t(artifact.subtitle, locale)}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-5">
        {id === "escalation-draft" ? (
          <ArtifactDraftPanel
            caseId={caseId}
            initialDraft={initialDraft}
            locale={locale}
            onDraftChange={onDraftChange}
          />
        ) : (
          <>
            <p className="m-0 text-xs font-extrabold uppercase tracking-wide text-[var(--green)]">{text.fixed}</p>
            <ul className="mb-0 mt-3 grid gap-1.5 pl-5 text-sm leading-relaxed text-[#36443d]">
              {renderArtifactBody(id, snapshot, locale).map((line, index) => <li key={`${id}-${index}`}>{line}</li>)}
            </ul>
            <Button asChild className="mt-4 min-h-11 bg-[var(--green)] px-4 font-extrabold text-white hover:bg-[#245a41]">
              <a aria-label={`${text.download} ${t(artifact.title, locale).toLocaleLowerCase(locale === "hi" ? "hi-IN" : "en-IN")}`} href={`/api/cases/${encodeURIComponent(caseId)}/artifacts/${encodeURIComponent(id)}?locale=${locale}`}>
                {text.download}
              </a>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
