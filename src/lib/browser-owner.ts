import { createHash, randomUUID } from "node:crypto";

export const BROWSER_OWNER_COOKIE = "sahayak-browser";

function cookieValue(request: Request) {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${BROWSER_OWNER_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function browserOwner(request: Request) {
  const existing = cookieValue(request);
  const token = existing ?? randomUUID();
  return {
    hash: createHash("sha256").update(token).digest("hex"),
    setCookie: existing ? null : [
      `${BROWSER_OWNER_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=31536000",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
    ].join("; "),
  };
}

export function existingBrowserOwnerHash(request: Request) {
  const token = cookieValue(request);
  return token ? createHash("sha256").update(token).digest("hex") : null;
}
