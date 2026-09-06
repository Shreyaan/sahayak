import { describe, expect, test } from "bun:test";
import { POST } from "./route";

let nextId = 0;

function rpc(method: string, params?: unknown): Request {
  nextId += 1;
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId, method, params }),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const frames = text.split("\n").filter((line) => line.startsWith("data:"));
    return JSON.parse(frames.at(-1)!.slice(5).trim());
  }
  return JSON.parse(text);
}

describe("POST /mcp", () => {
  test("exposes published retrieval and review-only workflow proposal", async () => {
    const result = await body(await POST(rpc("tools/list")));
    const tools = (result.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name).sort()).toEqual(["get_workflow", "propose_workflow", "search_workflows"]);
  });

  test("search_workflows uses published retrieval", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "search_workflows",
      arguments: { query: "scholarship released but payment missing", locale: "en" },
    })));
    const structured = (result.result as { structuredContent: { results: Array<{ workflowVersionId: string }> } }).structuredContent;
    expect(structured.results[0]?.workflowVersionId).toBe("scholarship-v5");
  });

  test("get_workflow rejects an unknown or unpublished version", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "get_workflow",
      arguments: { workflowVersionId: "nope" },
    })));
    const toolResult = result.result as { isError: boolean; content: Array<{ text: string }> };
    expect(toolResult.isError).toBe(true);
    expect(toolResult.content[0]?.text).toContain("not found");
  });
});
