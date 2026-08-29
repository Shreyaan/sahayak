export type CaseNodeState = "pending" | "needs-you" | "done";

export type CaseSnapshot = {
  id: string;
  nodes: Array<{ id: string; title: string; state: CaseNodeState }>;
};

export const initialCase: CaseSnapshot = {
  id: "bereavement-demo",
  nodes: [
    { id: "confirm-name", title: "नाम की पुष्टि", state: "needs-you" },
    { id: "bank-claim", title: "बैंक क्लेम तैयार करें", state: "pending" },
  ],
};

export function advanceCase(
  caseSnapshot: CaseSnapshot,
  message: string,
): CaseSnapshot {
  const negated = /\b(?:no|not|nope|nah|wrong)\b|नहीं|नही|गलत/i.test(message);
  const confirmed = !negated && (/\b(?:haan|yes|shyam\s+sunder)\b/i.test(message) || message.includes("हाँ"));

  if (!confirmed || caseSnapshot.nodes[0]?.state === "done") {
    return caseSnapshot;
  }

  return {
    ...caseSnapshot,
    nodes: [
      { ...caseSnapshot.nodes[0], state: "done" },
      { ...caseSnapshot.nodes[1], state: "needs-you" },
    ],
  };
}
