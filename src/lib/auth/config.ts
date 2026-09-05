export const REVIEW_ORG_ID = process.env.REVIEW_ORG_ID?.trim() || "sahayak-review-network";
export const REVIEW_ORG_NAME = "Sahayak Review Network";

export function appBaseUrl(request?: Request) {
  const configured = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL_REQUIRED");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
