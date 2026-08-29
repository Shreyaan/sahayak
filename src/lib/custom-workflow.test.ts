import { describe, expect, test } from "bun:test";
import {
  advanceDay,
  applyCitizenReply,
  findNode,
  registerWorkflowDefinition,
  startCase,
} from "./workflow";
import { assignWorkflowId, compileWorkflow, type WorkflowSpec } from "./custom-workflow";

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
});
