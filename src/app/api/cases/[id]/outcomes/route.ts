import { createCitizenOutcomeHandlers } from "@/lib/citizen-outcome-handlers";
import { citizenOutcomeService } from "@/lib/citizen-outcome-service";
import { isRateLimited } from "@/lib/rate-limit";

const handlers = createCitizenOutcomeHandlers(citizenOutcomeService);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return handlers.list(request, (await context.params).id);
}

export async function POST(request: Request, context: Context) {
  if (isRateLimited(request)) {
    return Response.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } }, { status: 429 });
  }
  return handlers.record(request, (await context.params).id);
}
