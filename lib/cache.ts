/**
 * Tiny in-memory TTL cache for proxy routes.
 *
 * Lives in the Node serverless function's memory — survives between
 * requests on warm instances, drops on cold start. That's fine for our
 * use case (rate-limit smoothing, not persistence).
 *
 * NOTE: do NOT use this for anything that must be consistent across
 * regions or instances. It's per-isolate.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached value or compute & cache it.
 *
 * @param key cache key (include all inputs that vary the result)
 * @param ttlMs how long the cached value is valid
 * @param compute async function to compute the value if missing/expired
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await compute();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Clear cache (for tests / debugging). */
export function clearCache(): void {
  store.clear();
}

/** Snapshot of cache size, for debugging. */
export function cacheStats(): { size: number; keys: string[] } {
  return { size: store.size, keys: Array.from(store.keys()) };
}
