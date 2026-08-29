/**
 * Live smoke test for Sahayak's MCP server (2026-07-28 modern mode).
 * Usage: BASE=https://sahayak.anosher.com bun scripts/mcp-smoke.mjs
 */
const BASE = (process.env.BASE ?? "http://localhost:3000") + "/mcp";
let id = 0;

const envelope = {
  _meta: {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
  },
};

async function call(name, args) {
  id += 1;
  const response = await fetch(BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { ...envelope, name, arguments: args } }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);

  const payload = JSON.parse(
    text.startsWith("data:") || text.startsWith("event:")
      ? text.split("\n").filter((l) => l.startsWith("data:")).at(-1).slice(5).trim()
      : text,
  );
  if (payload.error) throw new Error(`RPC: ${payload.error.message}`);
  return payload.result;
}

const list = await call("list_workflows", {});
console.log("list_workflows  →", list.structuredContent.workflows.map((w) => w.id).join(", "));

const one = await call("get_workflow", { id: "scholarship" });
console.log("get_workflow    →", one.structuredContent.steps.length, "steps; first:", JSON.stringify(one.structuredContent.steps[0].title));

const proposed = await call("propose_workflow", {
  title: "Smoke-test journey",
  steps: [
    { title: "Check the portal", kind: "website", url: "https://example.com" },
    { title: "Wait for the desk", kind: "desk" },
  ],
});
console.log("propose_workflow→", proposed.structuredContent.workflowId, "| saved:", proposed.structuredContent.saved);
console.log("previewUrl      →", proposed.structuredContent.previewUrl);
