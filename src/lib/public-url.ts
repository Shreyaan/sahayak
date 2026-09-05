/** Public links may be displayed to citizens or opened by a browser. */
export function isSafePublicUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.replace(/^\[|\]$/g, "");
  if (literal.includes(":")) return false;
  const parts = literal.split(".").map(Number);
  const isV4 = parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
  const isPrivateV4 = isV4 && (
    parts[0] === 0 || parts[0] === 10 || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    || (parts[0] === 192 && parts[1] === 0)
    || (parts[0] === 192 && parts[1] === 0 && parts[2] === 2)
    || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
    || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
    || parts[0] >= 224
  );
  const isLocal = literal === "localhost" || literal.endsWith(".localhost") || literal.endsWith(".local")
    || host === "host.docker.internal" || /^\d+$/.test(host);

  return !isPrivateV4 && !isLocal && (isV4 || literal.includes("."));
}
