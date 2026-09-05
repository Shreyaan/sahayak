const allowedOrganizationPaths = new Set([
  "/api/auth/organization/accept-invitation",
  "/api/auth/organization/set-active",
]);

/**
 * Better Auth installs a broad organization API. The product exposes only the
 * two invitee operations; all administration goes through our guarded routes.
 */
export function isAllowedPublicAuthPath(pathname: string) {
  return !pathname.startsWith("/api/auth/organization/")
    || allowedOrganizationPaths.has(pathname);
}
