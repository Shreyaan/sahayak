import { createMcpHandler } from "@modelcontextprotocol/server";
import { isRateLimited } from "@/lib/rate-limit";
import { buildSahayakMcpServer } from "@/mcp/sahayak-server";

export const maxDuration = 30;

// Stateless MCP: every request carries its own protocol metadata, so this
// factory runs per request with no session state.
const mcp = createMcpHandler(buildSahayakMcpServer);

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests. Please try again shortly." }, id: null },
      { status: 429 },
    );
  }

  return mcp.fetch(request);
}
