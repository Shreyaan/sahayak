import { z } from "zod";
import { caseDoneNode, type StepType, type WorkflowDefinition, type WorkflowNode } from "./workflow";
import type { Localized } from "./locale";

/**
 * Compiles what a user wrote into a journey the engine can run. Steps become a
 * linear chain: each one asks, then opens the next; desk steps add an SLA
 * clock; the closing Case Card step is appended automatically. One engine, no
 * special cases.
 */

export type WorkflowStepSpec = {
  title: string;
  detail?: string;
  ask?: string;
  kind: "confirm" | "visit" | "desk";
};

export type WorkflowSpec = {
  title: string;
  subtitle?: string;
  steps: WorkflowStepSpec[];
};

/** Shared shape for every entry path: the web form and the MCP tool. */
export const workflowSpecSchema = z.object({
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(160).optional(),
  steps: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    detail: z.string().trim().max(500).optional(),
    ask: z.string().trim().max(300).optional(),
    kind: z.enum(["confirm", "visit", "desk"]),
  })).min(1).max(12),
}).strict();

/**
 * Deterministic review signals for a proposed workflow. These are advisory
 * output for the contributing human or AI clerk — the compiler itself never
 * rejects on them, but a proposal that mentions unofficial payments is always
 * flagged.
 */
export function reviewFlagsFor(spec: WorkflowSpec): string[] {
  const flags: string[] = [];
  const text = [spec.title, spec.subtitle ?? "", ...spec.steps.map((s) => `${s.title} ${s.detail ?? ""}`)]
    .join(" ")
    .toLowerCase();

  if (/fee|charge|₹|rupee|ब्रिबे|रिश्वत|payment/.test(text) && !/do not|never|warn/.test(text)) {
    flags.push(
      "The description mentions a payment. Sahayak workflows never include unofficial payments — confirm no step asks the citizen to pay an agent, and consider adding a warning step instead.",
    );
  }

  if (/agent|dalal|दलाल|middleman|बिचौल/.test(text)) {
    flags.push(
      "The description mentions a middleman. Consider adding a confirm step that warns the citizen not to pay one.",
    );
  }

  return flags;
}

/** Structural suggestions an AI clerk should resolve before or after proposing. */
export function suggestionsFor(spec: WorkflowSpec): string[] {
  const suggestions: string[] = [];
  const kinds = new Set(spec.steps.map((step) => step.kind));

  if (spec.steps.length < 3) {
    suggestions.push("Ask the contributor whether there were intermediate steps between these.");
  }
  if (!kinds.has("visit")) {
    suggestions.push("Ask whether any step required visiting an office in person.");
  }
  if (!kinds.has("desk")) {
    suggestions.push("Ask whether any part involved waiting for a desk or office to reply, and how long it took.");
  }

  return suggestions;
}

export const stepKinds: WorkflowStepSpec["kind"][] = ["confirm", "visit", "desk"];

const both = (text: string): Localized => ({ hi: text, en: text });

function slugify(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return base || "journey";
}

function stepType(kind: WorkflowStepSpec["kind"]): StepType {
  if (kind === "visit") return "office-visit";
  if (kind === "desk") return "desk-verification";
  return "document-explain";
}

function visitCard(step: WorkflowStepSpec) {
  return {
    office: both(step.title),
    why: both(step.detail || step.title),
    carry: [
      both("Original documents and a photocopy set"),
      both("Your ID proof (Aadhaar or similar)"),
      both("This Case Card, printed or on your phone"),
    ],
    script: both(`I have come for: ${step.title}. Please give me an acknowledgement.`),
    expect: both("About 30 minutes"),
    collect: both("The acknowledgement with any reference number written on it"),
  };
}

/** A unique workflow id derived from the title. */
export function assignWorkflowId(spec: WorkflowSpec, taken: Set<string>): string {
  const base = `custom-${slugify(spec.title)}`;
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

export function compileWorkflow(spec: WorkflowSpec, id: string): WorkflowDefinition {
  const nodes: WorkflowNode[] = spec.steps.map((step, index) => {
    const nextId = `step-${index + 2}`;
    const nodeId = `step-${index + 1}`;
    const title = both(step.title);
    const detail = both(step.detail || step.title);
    const ask = both(step.ask || `क्या मैं आगे बढ़ूँ? (Shall I go ahead with: ${step.title}?)`);

    const onConfirm = step.kind === "desk"
      ? {
          state: "verifying" as const,
          reply: both(`${step.title} — जमा हो गया। जाँच शुरू है, मैं नज़र रखता हूँ. (Submitted. The desk is checking — I am keeping watch.)`),
        }
      : {
          state: "done" as const,
          opens: nextId,
          reply: both(`${step.title} — पूरा हुआ। अगला कदम देखिए. (Done. Here is the next step.)`),
        };

    return {
      id: nodeId,
      type: stepType(step.kind),
      title,
      detail,
      ask,
      visit: step.kind === "visit" ? visitCard(step) : undefined,
      onConfirm,
      verify: step.kind === "desk"
        ? {
            slaDays: 2,
            outcome: {
              state: "done" as const,
              opens: nextId,
              reply: both(`${step.title} — जाँच पूरी हुई, सब ठीक है. (The desk replied: all good, moving on.)`),
            },
          }
        : undefined,
    };
  });

  const last = nodes[nodes.length - 1];
  if (last) {
    // The final step opens the closing node instead of a step that does not exist.
    if (last.onConfirm.state === "verifying") {
      last.verify!.outcome.opens = "case-done";
      delete last.onConfirm.opens;
    } else {
      last.onConfirm.opens = "case-done";
    }
  }

  return {
    id,
    title: both(spec.title),
    subtitle: both(spec.subtitle || spec.title),
    firstNodeId: nodes[0]?.id ?? "case-done",
    nodes: [...nodes, caseDoneNode],
  };
}
