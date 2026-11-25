/** What the saved results cache keeps (06 §6.4). Pure, so it runs under vitest. */
export const CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

/** Query keys worth keeping across restarts: API answers only, never photos (rule 4). */
const KEPT = new Set(['search', 'product', 'product-history', 'searches']);

export function shouldPersist(q: {
  queryKey: readonly unknown[];
  state: { status: 'pending' | 'error' | 'success' };
}): boolean {
  return q.state.status === 'success' && KEPT.has(String(q.queryKey[0]));
}
