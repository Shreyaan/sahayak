import { describe, expect, test } from "bun:test";
import { workflows } from "./workflow";
import { applyWordingEdit, compareWorkflowDefinitions } from "./review-comparison";

const definition = () => structuredClone(workflows.scholarship);

describe("review comparison", () => {
  test("classifies stable ids and uses unmatched order as changed steps", () => {
    const proposed = definition();
    proposed.nodes[0]!.detail.en = "Updated payment status guidance";
    proposed.nodes.splice(1, 0, { ...structuredClone(proposed.nodes[1]!), id: "review-only-wording-node" });
    const baseline = definition();
    proposed.nodes = proposed.nodes.filter((node) => node.id !== "bank-seeding");

    expect(compareWorkflowDefinitions(proposed, baseline).map((row) => [row.proposedNodeId, row.status])).toEqual([
      ["pfms-trace", "changed"],
      ["review-only-wording-node", "same"],
      ["verify-again", "same"],
      ["grievance", "same"],
      ["credit", "same"],
      ["case-done", "same"],
    ]);
  });

  test("classifies unmatched extra and absent steps as added and missing", () => {
    const proposed = definition();
    proposed.nodes.push({ ...structuredClone(proposed.nodes.at(-1)!), id: "added-step", title: { hi: "नया", en: "New" }, detail: { hi: "नया विवरण", en: "New detail" } });
    const baseline = definition();
    const baselineWithMissing = definition();
    baselineWithMissing.nodes.push({ ...structuredClone(baselineWithMissing.nodes.at(-1)!), id: "missing-step", title: { hi: "अनुपस्थित", en: "Missing" }, detail: { hi: "अनुपस्थित विवरण", en: "Missing detail" } });

    const rows = compareWorkflowDefinitions(proposed, baseline);
    expect(rows.find((row) => row.proposedNodeId === "added-step")?.status).toBe("added");
    expect(compareWorkflowDefinitions(definition(), baselineWithMissing).find((row) => row.proposedNodeId === "missing-step")?.status).toBe("missing");
  });

  test("reconstructs only allowed wording and normalizes a no-op", () => {
    const stored = definition();
    const unchanged = applyWordingEdit(stored, {
      title: { hi: ` ${stored.title.hi} `, en: ` ${stored.title.en} ` },
      subtitle: { hi: stored.subtitle.hi, en: stored.subtitle.en },
      nodes: stored.nodes.map((node) => ({
        id: node.id,
        title: { hi: node.title.hi, en: node.title.en },
        detail: { hi: node.detail.hi, en: node.detail.en },
        ask: { hi: node.ask.hi, en: node.ask.en },
      })),
    });
    const changed = applyWordingEdit(stored, {
      title: { hi: stored.title.hi, en: "Updated scholarship guidance" },
      subtitle: stored.subtitle,
      nodes: stored.nodes.map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })),
    });

    expect(unchanged).toEqual(stored);
    expect(changed.title.en).toBe("Updated scholarship guidance");
    expect(changed.nodes.map((node) => node.id)).toEqual(stored.nodes.map((node) => node.id));
    expect(changed.nodes[0]?.onConfirm).toEqual(stored.nodes[0]?.onConfirm);
  });

  test("rejects a wording payload that tries to change workflow structure", () => {
    const stored = definition();
    expect(() => applyWordingEdit(stored, {
      title: stored.title,
      subtitle: stored.subtitle,
      nodes: stored.nodes.slice(1).map((node) => ({ id: node.id, title: node.title, detail: node.detail, ask: node.ask })),
    })).toThrow("INVALID_WORDING_EDIT");
  });

  test("uses remaining order to compare renamed nodes with no wording overlap", () => {
    const proposed = definition();
    proposed.nodes[0] = {
      ...proposed.nodes[0]!, id: "renamed-first-step",
      title: { hi: "बिल्कुल अलग", en: "Completely different" },
      detail: { hi: "अलग विवरण", en: "Different detail" },
    };

    const [first] = compareWorkflowDefinitions(proposed, definition());
    expect(first).toMatchObject({ proposedNodeId: "renamed-first-step", baselineNodeId: "pfms-trace", status: "changed" });
  });
});
