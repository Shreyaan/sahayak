/**
 * Counts how many contributors have reported the same claim signature.
 *
 * ponytail: This ledger lives in memory on one server instance. A real
 * deployment would persist corroboration; the prototype only needs to show the
 * semantics.
 */
const countsByClaim = new Map<string, number>();

export function recordCorroboration(claimKey: string): number {
  const next = (countsByClaim.get(claimKey) ?? 0) + 1;
  countsByClaim.set(claimKey, next);
  return next;
}

export function resetCorroboration(): void {
  countsByClaim.clear();
}
