"use client";

import { useLocale, useTranslations } from "next-intl";
import { use } from "react";
import { artifactContent } from "@/lib/artifacts";
import { t as translate, tList, type Locale } from "@/lib/locale";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  isClearedBlocker,
  isWorkflowId,
  nodeNote,
  startCase,
  workflowIds,
  workflows,
  type ArtifactId,
  type CaseSnapshot,
  type NodeState,
  type WorkflowId,
  type WorkflowNode,
} from "@/lib/workflow";
import { LanguageSwitcher } from "../language-switcher";
import styles from "./case-card.module.css";

const nodeStates: NodeState[] = ["pending", "needs-you", "verifying", "blocked", "done"];

const artifactIds = Object.keys(artifactContent) as ArtifactId[];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function decodeBase64Url(raw: string): unknown {
  const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

/**
 * Reads `?case=` into a case snapshot. Only the workflow id, node ids, node
 * states, artifact ids and the day count are taken from the link; every title,
 * detail and note is read back from the bundled seed, so a shared link can
 * never put its own text on the Case Card. Returns null when anything fails.
 */
function readCaseParam(raw: string): CaseSnapshot | null {
  let parsed: unknown;

  try {
    parsed = decodeBase64Url(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const candidate = parsed as Record<string, unknown>;
  if (!isWorkflowId(candidate.workflowId)) return null;

  const seed = workflows[candidate.workflowId];
  if (!Array.isArray(candidate.nodes) || candidate.nodes.length !== seed.nodes.length) return null;

  const states = new Map<string, NodeState>();

  for (const entry of candidate.nodes) {
    if (typeof entry !== "object" || entry === null) return null;

    const { id, state } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !seed.nodes.some((node) => node.id === id)) return null;
    if (typeof state !== "string" || !nodeStates.includes(state as NodeState)) return null;
    if (states.has(id)) return null;

    states.set(id, state as NodeState);
  }

  if (states.size !== seed.nodes.length) return null;

  const { day } = candidate;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 999) return null;

  const artifacts = Array.isArray(candidate.artifacts)
    ? candidate.artifacts.filter((id): id is ArtifactId =>
        typeof id === "string" && artifactIds.includes(id as ArtifactId))
    : [];

  return {
    workflowId: candidate.workflowId,
    nodes: seed.nodes.map((node) => ({ id: node.id, state: states.get(node.id) ?? "pending" })),
    artifacts: [...new Set(artifacts)],
    day,
  };
}

/**
 * Walks the real engine to the end of a journey, so the sample card shows the
 * same rejection, SLA breach and recovery the live demo produces. The replies
 * are engine input, not UI copy, so they stay in one language whatever the
 * reader's locale is.
 */
function sampleCase(workflowId: WorkflowId): CaseSnapshot {
  let snapshot = startCase(workflowId);

  for (let step = 0; step < 40; step += 1) {
    const node = currentNode(snapshot);

    if (node) {
      // Declining the identity check is what triggers the mismatch trap.
      const reply = node.type === "identity-compare" ? "नहीं" : "हाँ";
      snapshot = applyCitizenReply(snapshot, reply).caseSnapshot;
      continue;
    }

    if (!snapshot.nodes.some((entry) => entry.state === "verifying")) break;
    snapshot = advanceDay(snapshot).caseSnapshot;
  }

  return snapshot;
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
  return (
    <li className={styles.step}>
      <strong>{translate(node.title, locale)}</strong>
      <span>{translate(node.detail, locale)}</span>
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
  const common = useTranslations("common");
  const locale = useLocale() as Locale;

  const caseParam = firstValue(params.case);
  const workflowParam = firstValue(params.workflow);

  const decoded = caseParam ? readCaseParam(caseParam) : null;
  const unreadable = (caseParam !== undefined && decoded === null)
    || (workflowParam !== undefined && !isWorkflowId(workflowParam));

  const sampleWorkflow: WorkflowId = isWorkflowId(workflowParam) ? workflowParam : "bereavement";
  const snapshot = decoded ?? sampleCase(sampleWorkflow);
  const isSample = decoded === null;

  const seed = workflows[snapshot.workflowId];
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

  /** A blocked or cleared node's reason, always read from the bundled seed. */
  const noteFor = (nodeId: string): string | undefined => {
    const note = nodeNote(snapshot, nodeId);
    return note && translate(note, locale);
  };

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <a className={styles.back} href="/">
          {t("caseCard.back")}
        </a>
        <div className={styles.toolbarEnd}>
          <LanguageSwitcher />
          <button className={styles.print} type="button" onClick={() => window.print()}>
            {t("caseCard.print")}
          </button>
        </div>
      </div>

      {unreadable && (
        <p className={styles.warning} role="status">
          {t("caseCard.unreadable")}
        </p>
      )}

      <article className={styles.card}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>{t("caseCard.eyebrow")}</p>
          <h1>{translate(seed.title, locale)}</h1>
          <p className={styles.subtitle}>{translate(seed.subtitle, locale)}</p>
          <p className={styles.meta}>
            {t("caseCard.day", { day: snapshot.day })}
            {isSample && ` · ${t("caseCard.sampleCase")}`}
          </p>
          <p className={styles.synthetic}>{t("synthetic")}</p>
        </header>

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
            <dt>{t("caseCard.status.simulatedDay")}</dt>
            <dd>{snapshot.day}</dd>
            <dt>{t("caseCard.status.artifacts")}</dt>
            <dd>{snapshot.artifacts.length}</dd>
            <dt>{t("caseCard.status.desks")}</dt>
            <dd>{t("caseCard.status.desksValue")}</dd>
            <dt>{t("caseCard.status.submitted")}</dt>
            <dd>{t("caseCard.status.submittedValue")}</dd>
            <dt>{t("caseCard.status.references")}</dt>
            <dd>{t("caseCard.status.referencesValue")}</dd>
          </dl>
        </Section>

        <footer className={styles.footer}>
          <p>{t("synthetic")}</p>
          <p>{common("disclaimer")}</p>
        </footer>
      </article>

      <nav className={styles.samples}>
        <p className={styles.eyebrow}>{t("caseCard.samples.title")}</p>
        {workflowIds.map((id) => (
          <a key={id} href={`/case-card?workflow=${id}`}>
            {translate(workflows[id].title, locale)}
          </a>
        ))}
        <a href="/honesty">{t("caseCard.samples.honesty")}</a>
      </nav>
    </main>
  );
}
