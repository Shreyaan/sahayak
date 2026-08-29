import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resetMemoryStore } from "@/lib/store";
import { POST } from "./route";

beforeEach(resetMemoryStore);

afterEach(() => {
  resetMemoryStore();
});

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
  // Streamable HTTP may answer as SSE; take the last data frame either way.
  if (text.startsWith("event:") || text.startsWith("data:")) {
    const frames = text.split("\n").filter((line) => line.startsWith("data:"));
    return JSON.parse(frames.at(-1)!.slice(5).trim());
  }
  return JSON.parse(text);
}

describe("POST /mcp", () => {
  test("lists three tools", async () => {
    const result = await body(await POST(rpc("tools/list")));
    const tools = (result.result as { tools: Array<{ name: string }> }).tools;

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "get_workflow",
      "list_workflows",
      "propose_workflow",
    ]);
  });

  test("list_workflows returns the bundled catalog as structured content", async () => {
    const result = await body(await POST(rpc("tools/call", { name: "list_workflows", arguments: {} })));
    const structured = (result.result as { structuredContent: { workflows: Array<{ id: string }> } }).structuredContent;

    expect(structured.workflows.map((w) => w.id)).toEqual(["bereavement", "scholarship"]);
  });

  test("propose_workflow compiles, registers, and returns a preview plus guidance", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "propose_workflow",
      arguments: {
        title: "Getting a ration card",
        steps: [
          { title: "Check the documents", detail: "Carry Aadhaar and address proof", kind: "confirm" },
          { title: "Submit at the tehsil office", kind: "visit" },
          { title: "Verification", kind: "desk" },
        ],
      },
    })));

    const structured = (result.result as {
      structuredContent: {
        workflowId: string;
        saved: boolean;
        previewUrl: string;
        flags: string[];
        suggestions: string[];
      };
    }).structuredContent;

    expect(structured.workflowId).toBe("custom-getting-a-ration-card");
    expect(structured.saved).toBe(true);
    expect(structured.previewUrl).toContain("/case-card?workflow=custom-getting-a-ration-card");
    // A complete proposal with visit and desk steps needs no structural suggestions.
    expect(structured.suggestions).toHaveLength(0);

    // Registered on the engine: it runs like a bundled journey.
    const list = await body(await POST(rpc("tools/call", { name: "list_workflows", arguments: {} })));
    const ids = (list.result as { structuredContent: { workflows: Array<{ id: string }> } }).structuredContent
      .workflows.map((w) => w.id);
    expect(ids).toContain("custom-getting-a-ration-card");
  });

  test("a proposal mentioning an agent or a payment is flagged for review", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "propose_workflow",
      arguments: {
        title: "Fast passport through an agent",
        steps: [{ title: "Pay the agent fee", kind: "confirm" }],
      },
    })));

    const structured = (result.result as { structuredContent: { flags: string[] } }).structuredContent;

    expect(structured.flags.length).toBeGreaterThan(0);
    expect(structured.flags.join(" ")).toContain("never include unofficial payments");
  });

  test("an incomplete proposal gets structural suggestions for the clerk to ask", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "propose_workflow",
      arguments: {
        title: "Quick thing",
        steps: [{ title: "Do it", kind: "confirm" }],
      },
    })));

    const structured = (result.result as { structuredContent: { suggestions: string[] } }).structuredContent;
    const joined = structured.suggestions.join(" ");

    expect(joined).toContain("intermediate steps");
    expect(joined).toContain("visiting an office");
  });

  test("rejects an invalid proposal without corrupting the registry", async () => {
    const result = await body(await POST(rpc("tools/call", {
      name: "propose_workflow",
      arguments: { title: "No", steps: [] },
    })));

    // The SDK reports tool-level validation as an error result, not a wire error.
    const toolResult = result.result as { isError: boolean; content: Array<{ text: string }> };
    expect(toolResult.isError).toBe(true);
    expect(toolResult.content[0].text).toContain("Invalid arguments");

    const list = await body(await POST(rpc("tools/call", { name: "list_workflows", arguments: {} })));
    const ids = (list.result as { structuredContent: { workflows: Array<{ id: string }> } }).structuredContent
      .workflows.map((w) => w.id);
    expect(ids).toEqual(["bereavement", "scholarship"]);
  });

  test("get_workflow returns an error for an unknown id", async () => {
    const result = await body(await POST(rpc("tools/call", { name: "get_workflow", arguments: { id: "nope" } })));
    const toolResult = result.result as { isError: boolean; content: Array<{ text: string }> };

    expect(toolResult.isError).toBe(true);
    expect(toolResult.content[0].text).toContain("list_workflows");
  });
});
