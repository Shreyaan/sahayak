import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { clarifySearch } from "@/lib/search/clarify-search";
import { searchWorkflows, searchWorkflowsInputSchema } from "@/lib/search/search-workflows";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (isRateLimited(request)) {
    return NextResponse.json({ code: "RATE_LIMITED", error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const parsed = searchWorkflowsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "INVALID_SEARCH", error: "Describe the problem in at least two characters." }, { status: 400 });
  }

  try {
    const result = await searchWorkflows(parsed.data);
    if (!result.shouldClarify) return NextResponse.json(result);
    if (parsed.data.clarificationAttempt >= 1) {
      return NextResponse.json({ results: [], needsLocation: false, shouldClarify: false, unsupported: true });
    }

    if (result.clarificationQuestion) return NextResponse.json(result);

    let clarificationQuestion: string;
    try {
      clarificationQuestion = await clarifySearch({ query: parsed.data.query, locale: parsed.data.locale });
    } catch {
      clarificationQuestion = parsed.data.locale === "hi"
        ? "यह किस योजना, पोर्टल या सरकारी काम से जुड़ा है? केवल नाम बताएँ, निजी नंबर नहीं।"
        : "Which scheme, portal or government task is this about? Give its name, not personal numbers.";
    }
    return NextResponse.json({ ...result, clarificationQuestion });
  } catch {
    return NextResponse.json({ code: "SEARCH_UNAVAILABLE", error: "Search is unavailable right now." }, { status: 503 });
  }
}
