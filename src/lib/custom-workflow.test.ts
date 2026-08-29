import { describe, expect, test } from "bun:test";
import {
  advanceDay,
  applyCitizenReply,
  findNode,
  registerWorkflowDefinition,
  startCase,
} from "./workflow";
import {
  assignWorkflowId,
  compileWorkflow,
  isSafePublicUrl,
  workflowSpecSchema,
  type WorkflowSpec,
} from "./custom-workflow";

const spec: WorkflowSpec = {
  title: "Getting a caste certificate",
  subtitle: "From Form 1 to the certificate",
  steps: [
    { title: "Check eligibility", detail: "Domicile and income basics", kind: "confirm" },
    { title: "Visit the tehsil office", detail: "Carry originals", kind: "visit" },
    { title: "Verification at the counter", kind: "desk" },
    { title: "Collect the certificate", kind: "confirm" },
  ],
};

describe("compileWorkflow", () => {
  test("produces a journey the shared engine can run to the end", () => {
    const definition = compileWorkflow(spec, "custom-caste-certificate");
    registerWorkflowDefinition(definition);

    expect(definition.nodes[definition.nodes.length - 1].type).toBe("case-complete");
    expect(definition.firstNodeId).toBe("step-1");

    let snapshot = startCase("custom-caste-certificate");

    for (let hops = 0; hops < 30; hops += 1) {
      const current = snapshot.nodes.find((entry) => entry.state === "needs-you");
      snapshot = current
        ? applyCitizenReply(snapshot, "हाँ").caseSnapshot
        : advanceDay(snapshot).caseSnapshot;
    }

    const caseDone = snapshot.nodes.find((entry) => entry.id === "case-done");
    expect(caseDone?.state).toBe("done");
  });

  test("a desk step runs its SLA clock and then completes", () => {
    const definition = compileWorkflow(spec, "custom-caste-certificate");
    const desk = definition.nodes.find((node) => node.id === "step-3")!;

    expect(desk.verify?.slaDays).toBe(2);
    expect(desk.onConfirm.state).toBe("verifying");
  });

  test("a visit step carries an office-visit card", () => {
    const definition = compileWorkflow(spec, "custom-caste-certificate");
    const visit = definition.nodes.find((node) => node.id === "step-2")!;

    expect(visit.visit?.office.en).toBe("Visit the tehsil office");
    expect(visit.type).toBe("office-visit");
  });

  test("assigns unique ids derived from the title", () => {
    const taken = new Set(["custom-getting-a-caste-certificate"]);

    expect(assignWorkflowId(spec, new Set())).toBe("custom-getting-a-caste-certificate");
    expect(assignWorkflowId(spec, taken)).toBe("custom-getting-a-caste-certificate-2");
  });

  test("a website step carries a validated link the citizen can open", () => {
    const websiteSpec: WorkflowSpec = {
      title: "Track the payment online",
      steps: [
        { title: "Open the PFMS tracker", kind: "website", url: "https://pfms.nic.in/track" },
        { title: "Enter the application number", kind: "confirm" },
      ],
    };

    const definition = compileWorkflow(websiteSpec, "custom-track");
    const webStep = definition.nodes.find((node) => node.id === "step-1")!;

    expect(webStep.type).toBe("online-action");
    expect(webStep.link?.url).toBe("https://pfms.nic.in/track");
    expect(webStep.visit).toBeUndefined();
    expect(webStep.verify).toBeUndefined();

    registerWorkflowDefinition(definition);
    const snapshot = startCase("custom-track");
    const answered = applyCitizenReply(snapshot, "हाँ").caseSnapshot;
    expect(answered.nodes[0].state).toBe("done");
    expect(answered.nodes[1].state).toBe("needs-you");
  });

  test("website URLs must be public https addresses", () => {
    expect(isSafePublicUrl("https://pfms.nic.in/track")).toBe(true);
    expect(isSafePublicUrl("http://pfms.nic.in/track")).toBe(false);
    expect(isSafePublicUrl("https://localhost/track")).toBe(false);
    expect(isSafePublicUrl("https://127.0.0.1/track")).toBe(false);
    expect(isSafePublicUrl("https://192.168.1.4/admin")).toBe(false);
    expect(isSafePublicUrl("https://172.16.0.9/internal")).toBe(false);
    expect(isSafePublicUrl("https://10.0.0.5/x")).toBe(false);
    expect(isSafePublicUrl("https://user:pass@example.com")).toBe(false);
    expect(isSafePublicUrl("not a url")).toBe(false);
  });

  test("the shared schema rejects a website step without a safe URL", () => {
    const bad = workflowSpecSchema.safeParse({
      title: "Track the payment online",
      steps: [{ title: "Open the tracker", kind: "website" }],
    });

    expect(bad.success).toBe(false);

    const misplaced = workflowSpecSchema.safeParse({
      title: "A visit journey",
      steps: [{ title: "Go there", kind: "visit", url: "https://example.com" }],
    });

    expect(misplaced.success).toBe(false);
  });
});
