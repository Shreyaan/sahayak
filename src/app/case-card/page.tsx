"use client";

import { useLocale, useTranslations } from "next-intl";
import { use, useEffect, useState } from "react";
import { artifactContent } from "@/lib/artifacts";
import { t as translate, tList, type Locale } from "@/lib/locale";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  getCaseWorkflowDefinition,
  isClearedBlocker,
  nodeNote,
  registerWorkflowDefinition,
  type CaseSnapshot,
  type NodeState,
  type WorkflowNode,
} from "@/lib/workflow";
import { LanguageSwitcher } from "../language-switcher";
import styles from "./case-card.module.css";
import type { CitizenOutcome } from "@/lib/citizen-outcomes";
import type { TrustMetadata, WorkflowJurisdiction } from "@/lib/trust";
import { TrustDisclosure } from "../trust-disclosure";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function StepRow({
  node,
  locale,
  note,
}: {
  node: WorkflowNode;
  locale: Locale;
  note?: string;
}) {
  const title = translate(node.title, locale);
  const detail = translate(node.detail, locale);

  return (
    <li className={styles.step}>
      <strong>{title}</strong>
      {detail !== title && <span>{detail}</span>}
      {node.link && (
        <a href={node.link.url} target="_blank" rel="noopener noreferrer">
          {node.link.url}
        </a>
      )}
      {note && <em className={styles.note}>{note}</em>}
    </li>
  );
}

export default function CaseCardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = use(searchParams);
  const t = useTranslations("pages");
  const locale = useLocale() as Locale;

  const [outcomes, setOutcomes] = useState<CitizenOutcome[]>([]);
  const [ownedSnapshot, setOwnedSnapshot] = useState<CaseSnapshot | null>(null);
  const [caseLoadFailed, setCaseLoadFailed] = useState(false);
  const [outcomesLoadFailed, setOutcomesLoadFailed] = useState(false);
  const [ownedTrust, setOwnedTrust] = useState<TrustMetadata | null>(null);
  const [ownedJurisdiction, setOwnedJurisdiction] = useState<WorkflowJurisdiction | null>(null);
  const caseIdParam = firstValue(params.caseId);

  useEffect(() => {
    if (!caseIdParam) return;
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(caseIdParam)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "case unavailable");
        return result;
      })
      .then(({ case: savedCase, definition, trust, jurisdiction }) => {
        if (cancelled || !savedCase?.snapshot || !definition || !trust || !jurisdiction) return;
        registerWorkflowDefinition(definition, savedCase.snapshot.workflowVersionId);
        setOwnedSnapshot(savedCase.snapshot);
        setOwnedTrust(trust);
        setOwnedJurisdiction(jurisdiction);
      })
      .catch(() => {
        if (!cancelled) setCaseLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [caseIdParam]);

  useEffect(() => {
    if (!caseIdParam || !ownedSnapshot) return;
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(caseIdParam)}/outcomes`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "outcomes unavailable");
        return result;
      })
      .then(({ outcomes: list }) => {
        if (!cancelled && Array.isArray(list)) setOutcomes(list);
      })
      .catch(() => {
        if (!cancelled) setOutcomesLoadFailed(true);
      });
    return () => { cancelled = true; };
  }, [caseIdParam, ownedSnapshot]);

  if (!caseIdParam) {
    return <main className={styles.page}><a className={styles.back} href="/">{t("caseCard.back")}</a></main>;
  }

  if (!ownedSnapshot && !caseLoadFailed) {
    return (
      <main className={styles.page}>
        <p role="status">{t("caseCard.loading")}</p>
      </main>
    );
  }

  if (caseLoadFailed) {
    return (
      <main className={styles.page}>
        <a className={styles.back} href="/">{t("caseCard.back")}</a>
        <p className={styles.warning} role="alert">{t("caseCard.unreadable")}</p>
      </main>
    );
  }

  const snapshot = ownedSnapshot;
  if (!snapshot) return null;

  const seed = getCaseWorkflowDefinition(snapshot);
  if (!seed) return null;
  const stateById = new Map(snapshot.nodes.map((entry) => [entry.id, entry.state]));
  const steps = seed.nodes.map((node) => ({
    node,
    state: stateById.get(node.id) ?? ("pending" as NodeState),
  }));

  const done = steps.filter((step) => step.state === "done");
  const current = steps.find((step) => step.state === "needs-you");
  const verifying = steps.filter((step) => step.state === "verifying");
  const blocked = steps.filter((step) => step.state === "blocked");
  // A blocker the recovery step already closed: proof the case survived it.
  const cleared = steps.filter((step) => isClearedBlocker(snapshot, step.node.id));
  const complete = steps.every((step) => step.state === "done" || step.state === "pending")
    && steps.some((step) => step.node.type === "case-complete" && step.state === "done");
  const visits = seed.nodes.filter((node) => node.visit);
  const outcomeLabels = locale === "hi" ? {
    awareness: "यात्रा शुरू हुई",
    worked: "बताए अनुसार हुआ",
    different: "कुछ अलग हुआ",
    stuck: "नागरिक अटक गया/गई",
    skipped: "प्रतिक्रिया छोड़ी गई",
    resolved: "समस्या हल होने की पुष्टि",
  } : {
    awareness: "Journey started",
    worked: "Worked as shown",
    different: "Something was different",
    stuck: "Citizen got stuck",
    skipped: "Feedback skipped",
    resolved: "Resolution confirmed",
  };
  const formatTime = (value: string) => new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

  /** A blocked or cleared node's reason, always read from the bundled seed. */
  const noteFor = (nodeId: string): string | undefined => {
    const note = nodeNote(snapshot, nodeId);
    return note && translate(note, locale);
  };

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <a className={styles.back} href={`/?caseId=${encodeURIComponent(caseIdParam)}`}>
          {t("caseCard.continue")}
        </a>
        <div className={styles.toolbarEnd}>
          <LanguageSwitcher />
          <button className={styles.print} type="button" onClick={() => window.print()}>
            {t("caseCard.print")}
          </button>
        </div>
      </div>

      <article className={styles.card}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{t("caseCard.eyebrow")}</p>
          <h1>{translate(seed.title, locale)}</h1>
          <p className={styles.subtitle}>{translate(seed.subtitle, locale)}</p>
          <p className={styles.meta}>
            {t("caseCard.day", { day: snapshot.day })}
          </p>
        </header>

        {ownedTrust && ownedJurisdiction && <TrustDisclosure trust={ownedTrust} jurisdiction={ownedJurisdiction} locale={locale} />}

        <Section title={t("caseCard.completed.title")}>
          {done.length > 0 ? (
            <ol className={styles.steps}>
              {done.map((step) => (
                <StepRow key={step.node.id} node={step.node} locale={locale} />
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>{t("caseCard.completed.empty")}</p>
          )}
        </Section>

        <Section title={t("caseCard.current.title")}>
          {current ? (
            <ol className={styles.steps}>
              <StepRow
                node={current.node}
                locale={locale}
                note={translate(current.node.ask, locale)}
              />
            </ol>
          ) : (
            <p className={styles.empty}>{t("caseCard.current.empty")}</p>
          )}
          {verifying.length > 0 && (
            <ol className={styles.steps}>
              {verifying.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  locale={locale}
                  note={t("caseCard.current.verifying")}
                />
              ))}
            </ol>
          )}
        </Section>

        <Section title={t("caseCard.blocked.title")}>
          {blocked.length > 0 ? (
            <ol className={styles.steps}>
              {blocked.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  locale={locale}
                  note={noteFor(step.node.id)}
                />
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>{t("caseCard.blocked.empty")}</p>
          )}
        </Section>

        {cleared.length > 0 && (
          <Section title={t("caseCard.cleared.title")}>
            <ol className={styles.steps}>
              {cleared.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  locale={locale}
                  note={noteFor(step.node.id)}
                />
              ))}
            </ol>
          </Section>
        )}

        <Section title={t("caseCard.visits.title")}>
          {visits.length > 0 ? (
            visits.map((node) => {
              const visit = node.visit;
              if (!visit) return null;

              return (
                <div key={node.id} className={styles.visit}>
                  <h3>{translate(visit.office, locale)}</h3>
                  <p className={styles.why}>{translate(visit.why, locale)}</p>
                  <dl className={styles.pairs}>
                    <dt>{t("caseCard.visits.carry")}</dt>
                    <dd>{tList(visit.carry, locale).join(" · ")}</dd>
                    <dt>{t("caseCard.visits.script")}</dt>
                    <dd>“{translate(visit.script, locale)}”</dd>
                    <dt>{t("caseCard.visits.expect")}</dt>
                    <dd>{translate(visit.expect, locale)}</dd>
                    <dt>{t("caseCard.visits.collect")}</dt>
                    <dd>{translate(visit.collect, locale)}</dd>
                  </dl>
                </div>
              );
            })
          ) : (
            <p className={styles.empty}>{t("caseCard.visits.empty")}</p>
          )}
          <p className={styles.empty}>{t("caseCard.visits.noAgent")}</p>
        </Section>

        <Section title={t("caseCard.artifacts.title")}>
          {snapshot.artifacts.length > 0 ? (
            snapshot.artifacts.map((id) => {
              const artifact = artifactContent[id];

              return (
                <div key={id} className={styles.artifact}>
                  <h3>{translate(artifact.title, locale)}</h3>
                  <p className={styles.why}>{translate(artifact.subtitle, locale)}</p>
                  <ul className={styles.body}>
                    {tList(artifact.body, locale).map((line, index) => (
                      <li key={`${id}-${index}`}>{line}</li>
                    ))}
                  </ul>
                  <p className={styles.draftLabel}>{t("caseCard.artifacts.draftLabel")}</p>
                </div>
              );
            })
          ) : (
            <p className={styles.empty}>{t("caseCard.artifacts.empty")}</p>
          )}
        </Section>

        <Section title={t("caseCard.status.title")}>
          <dl className={styles.pairs}>
            <dt>{t("caseCard.status.journey")}</dt>
            <dd>
              {translate(seed.title, locale)} ({translate(seed.subtitle, locale)})
            </dd>
            <dt>{t("caseCard.status.caseStatus")}</dt>
            <dd>{complete ? t("caseCard.status.complete") : t("caseCard.status.inProgress")}</dd>
            <dt>{t("caseCard.status.blockersCleared")}</dt>
            <dd>{cleared.length}</dd>
            <dt>{t("caseCard.status.stepsDone")}</dt>
            <dd>
              {done.length} / {steps.length}
            </dd>
            <dt>{t("caseCard.status.day")}</dt>
            <dd>{snapshot.day}</dd>
            <dt>{t("caseCard.status.artifacts")}</dt>
            <dd>{snapshot.artifacts.length}</dd>
            <dt>{t("caseCard.status.references")}</dt>
            <dd>{t("caseCard.status.referencesValue")}</dd>
          </dl>
        </Section>

        {caseIdParam && (
          <Section title={locale === "hi" ? "नतीजे और प्रमाण" : "Outcomes and evidence"}>
            {outcomesLoadFailed ? (
              <p className={styles.warning} role="alert">
                {locale === "hi" ? "नतीजे अभी उपलब्ध नहीं हैं। फिर से कोशिश करें।" : "Outcome evidence is unavailable. Please try again."}
              </p>
            ) : outcomes.length > 0 ? (
              <ol className={styles.steps}>
                {outcomes.map((outcome) => {
                  const step = outcome.stepId ? seed.nodes.find(({ id }) => id === outcome.stepId) : undefined;
                  return (
                    <li className={styles.step} key={outcome.id}>
                      <strong>{outcomeLabels[outcome.kind]}</strong>
                      <span>{formatTime(outcome.occurredAt)}</span>
                      {step ? <span>{translate(step.title, locale)}</span> : null}
                      {outcome.detail ? <em className={styles.note}>{outcome.detail}</em> : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.empty}>
                {locale === "hi" ? "अभी कोई नतीजा दर्ज नहीं है।" : "No outcome evidence has been recorded yet."}
              </p>
            )}
          </Section>
        )}
      </article>

    </main>
  );
}
