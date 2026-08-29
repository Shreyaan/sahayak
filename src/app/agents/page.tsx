import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI and agent access — Sahayak",
  description: "How AI agents discover and operate Sahayak's contributor workflows.",
};

const endpoint = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export default function AgentsPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", lineHeight: 1.6 }}>
      <h1>AI and agent access</h1>
      <p>
        Sahayak exposes a machine interface so an AI assistant can help a contributor turn
        their real experience with a government process into a guided, step-by-step journey —
        without scraping the page or guessing forms.
      </p>

      <h2>Remote MCP</h2>
      <p>
        <code>{`${endpoint}/mcp`}</code>
      </p>
      <p>
        Streamable HTTP, stateless. Tools: <code>list_workflows</code>, <code>get_workflow</code>,{" "}
        <code>propose_workflow</code>. The server&apos;s instructions tell the assistant which
        clarifying questions to ask a contributor before proposing.
      </p>

      <h2>Discovery</h2>
      <p>
        <a href="/.well-known/ai-catalog.json">/.well-known/ai-catalog.json</a>
      </p>

      <h2>How proposing works</h2>
      <ol>
        <li>The assistant asks the contributor for the exact order of steps.</li>
        <li>Each step is classified: a simple confirmation, an office visit, or a desk check with a wait.</li>
        <li>The assistant calls <code>propose_workflow</code>; Sahayak&apos;s deterministic compiler builds the journey.</li>
        <li>The tool returns a preview link and review suggestions to discuss with the contributor.</li>
        <li>The journey appears on the home screen for anyone to run.</li>
      </ol>

      <h2>Boundaries</h2>
      <p>
        The AI never decides structure: step kinds are a fixed enum, the closing summary step is
        added by the compiler, and proposals mentioning unofficial payments are flagged for review.
        This prototype does not yet authenticate agent calls; a production deployment would use
        OAuth with fine-grained scopes (read / propose / publish).
      </p>
    </main>
  );
}
