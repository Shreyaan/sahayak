"use client";

import { use } from "react";
import { artifactContent } from "@/lib/artifacts";
import {
  advanceDay,
  applyCitizenReply,
  currentNode,
  isClearedBlocker,
  isWorkflowId,
  nodeNote,
  startCase,
  workflows,
  type ArtifactId,
  type CaseSnapshot,
  type NodeState,
  type WorkflowId,
  type WorkflowNode,
} from "@/lib/workflow";
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
 * same rejection, SLA breach and recovery the live demo produces.
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

function Section({
  hindi,
  english,
  children,
}: {
  hindi: string;
  english: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>
        {hindi} <span>{english}</span>
      </h2>
      {children}
    </section>
  );
}

function StepRow({ node, note }: { node: WorkflowNode; note?: string }) {
  return (
    <li className={styles.step}>
      <strong>{node.title}</strong>
      <span>{node.detail}</span>
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

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <a className={styles.back} href="/">
          ← होम · Home
        </a>
        <button className={styles.print} type="button" onClick={() => window.print()}>
          प्रिंट करें · Print
        </button>
      </div>

      {unreadable && (
        <p className={styles.warning} role="status">
          यह Case Card लिंक पढ़ा नहीं जा सका। नीचे एक नमूना केस दिखाया गया है.
          <span>This Case Card link is not readable. A sample case is shown below.</span>
        </p>
      )}

      <article className={styles.card}>
        <header className={styles.head}>
          <p className={styles.eyebrow}>Sahayak · Case Card</p>
          <h1>{seed.title}</h1>
          <p className={styles.subtitle}>{seed.subtitle}</p>
          <p className={styles.meta}>
            नमूना दिन {snapshot.day} · Simulated day {snapshot.day}
            {isSample && " · नमूना केस · Sample case"}
          </p>
          <p className={styles.synthetic}>SYNTHETIC DEMO — all values are synthetic</p>
        </header>

        <Section hindi="पूरी हुई कार्रवाइयाँ" english="Completed actions">
          {done.length > 0 ? (
            <ol className={styles.steps}>
              {done.map((step) => (
                <StepRow key={step.node.id} node={step.node} />
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>अभी कोई कदम पूरा नहीं हुआ · No completed actions yet</p>
          )}
        </Section>

        <Section hindi="अभी की कार्रवाई" english="Current action">
          {current ? (
            <ol className={styles.steps}>
              <StepRow node={current.node} note={current.node.ask} />
            </ol>
          ) : (
            <p className={styles.empty}>
              कोई कार्रवाई लंबित नहीं · No action pending
            </p>
          )}
          {verifying.length > 0 && (
            <ol className={styles.steps}>
              {verifying.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  note="जाँच जारी (नमूना डेस्क) · In verification at a simulated desk"
                />
              ))}
            </ol>
          )}
        </Section>

        <Section hindi="रुकी हुई कार्रवाइयाँ" english="Blocked actions">
          {blocked.length > 0 ? (
            <ol className={styles.steps}>
              {blocked.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  note={nodeNote(snapshot, step.node.id)}
                />
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>कुछ भी रुका हुआ नहीं · Nothing blocked</p>
          )}
        </Section>

        {cleared.length > 0 && (
          <Section hindi="रास्ते में आई रुकावटें, जो हटीं" english="Blockers cleared along the way">
            <ol className={styles.steps}>
              {cleared.map((step) => (
                <StepRow
                  key={step.node.id}
                  node={step.node}
                  note={nodeNote(snapshot, step.node.id)}
                />
              ))}
            </ol>
          </Section>
        )}

        <Section hindi="दफ़्तर के चक्कर" english="Office visits">
          {visits.length > 0 ? (
            visits.map((node) => {
              const visit = node.visit;
              if (!visit) return null;

              return (
                <div key={node.id} className={styles.visit}>
                  <h3>{visit.office}</h3>
                  <p className={styles.why}>{visit.why}</p>
                  <dl className={styles.pairs}>
                    <dt>साथ ले जाएँ · Carry</dt>
                    <dd>{visit.carry.join(" · ")}</dd>
                    <dt>काउंटर पर कहें · Script</dt>
                    <dd>“{visit.script}”</dd>
                    <dt>अनुमानित समय · Expect</dt>
                    <dd>{visit.expect}</dd>
                    <dt>क्या लेकर लौटें · Collect</dt>
                    <dd>{visit.collect}</dd>
                  </dl>
                </div>
              );
            })
          ) : (
            <p className={styles.empty}>इस यात्रा में कोई दफ़्तर नहीं जाना है · No office visit needed</p>
          )}
          <p className={styles.empty}>
            किसी बिचौलिए को पैसा न दें · Do not pay an unauthorised agent.
          </p>
        </Section>

        <Section hindi="बने हुए काग़ज़" english="Generated artifacts">
          {snapshot.artifacts.length > 0 ? (
            snapshot.artifacts.map((id) => {
              const artifact = artifactContent[id];

              return (
                <div key={id} className={styles.artifact}>
                  <h3>{artifact.title}</h3>
                  <p className={styles.why}>{artifact.subtitle}</p>
                  <ul className={styles.body}>
                    {artifact.body.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className={styles.draftLabel}>
                    नमूना मसौदा — कहीं जमा नहीं किया गया · Demonstration draft, never submitted
                  </p>
                </div>
              );
            })
          ) : (
            <p className={styles.empty}>अभी कोई काग़ज़ नहीं बना · No artifacts generated yet</p>
          )}
        </Section>

        <Section hindi="संदर्भ और स्थिति" english="References and status">
          <dl className={styles.pairs}>
            <dt>यात्रा · Journey</dt>
            <dd>
              {seed.title} ({seed.subtitle})
            </dd>
            <dt>केस की स्थिति · Case status</dt>
            <dd>{complete ? "पूरा हुआ · Complete" : "चालू · In progress"}</dd>
            <dt>हटाई गई रुकावटें · Blockers cleared</dt>
            <dd>{cleared.length}</dd>
            <dt>कदम पूरे · Steps done</dt>
            <dd>
              {done.length} / {steps.length}
            </dd>
            <dt>नमूना दिन · Simulated day</dt>
            <dd>{snapshot.day}</dd>
            <dt>बने काग़ज़ · Artifacts</dt>
            <dd>{snapshot.artifacts.length}</dd>
            <dt>सरकारी डेस्क · Government desks</dt>
            <dd>सिम्युलेटेड · Simulated</dd>
            <dt>जमा किया गया · Submitted</dt>
            <dd>कुछ भी नहीं · Nothing, anywhere</dd>
            <dt>संदर्भ संख्या · Reference numbers</dt>
            <dd>
              असली संदर्भ काउंटर की पावती से ही मिलेगा · Real references come only from a counter
              receipt
            </dd>
          </dl>
        </Section>

        <footer className={styles.footer}>
          <p>SYNTHETIC DEMO — all values are synthetic</p>
          <p>Independent hackathon prototype. Not affiliated with any government body.</p>
        </footer>
      </article>

      <nav className={styles.samples}>
        <p className={styles.eyebrow}>नमूना केस · Sample cases</p>
        <a href="/case-card?workflow=bereavement">मृत्यु के बाद के दावे · Bereavement</a>
        <a href="/case-card?workflow=scholarship">अटकी हुई छात्रवृत्ति · Scholarship</a>
        <a href="/honesty">क्या असली, क्या नमूना · Honesty</a>
      </nav>
    </main>
  );
}
