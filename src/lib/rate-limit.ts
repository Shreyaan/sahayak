const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 20;

type Window = { count: number; resetAt: number };

// ponytail: This in-memory limiter is scoped to one server instance, not shared across replicas.
const windowsByIp = new Map<string, Window>();

export function isRateLimited(request: Request, now = Date.now()): boolean {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const current = windowsByIp.get(ip);

  if (!current || now >= current.resetAt) {
    windowsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > REQUEST_LIMIT;
}
