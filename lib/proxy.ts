/**
 * Helpers for upstream API proxies.
 *
 * All upstream HTTP requests in this app must go through these helpers,
 * not direct fetch() calls from components or pages, because:
 *   1. API keys live in server-only env vars, never exposed to the browser.
 *   2. Responses are cached in-memory to smooth rate limits (Finnhub free
 *      tier is 60 req/min, Alpha Vantage free is 25 req/day).
 *   3. Errors are normalized so the UI gets a consistent shape.
 */
import { cached } from "./cache";

export type ProxyOk<T> = { ok: true; data: T; cached: boolean };
export type ProxyErr = { ok: false; status: number; error: string };
export type ProxyResult<T> = ProxyOk<T> | ProxyErr;

/**
 * Fetch JSON from an upstream URL with caching.
 *
 * On non-2xx upstream responses, returns a ProxyErr. On network failure,
 * returns a ProxyErr with status 502.
 */
export async function fetchJsonCached<T = unknown>(
  url: string,
  cacheKey: string,
  ttlMs: number,
  init?: RequestInit,
): Promise<ProxyResult<T>> {
  let wasCached = true;
  try {
    const data = await cached<T>(cacheKey, ttlMs, async () => {
      wasCached = false;
      const res = await fetch(url, {
        ...init,
        // Make sure Next.js doesn't try to cache this on its own — we
        // manage cache via the in-memory layer.
        cache: "no-store",
      });
      if (!res.ok) {
        // Throw so we don't poison the cache with errors.
        throw new ProxyHttpError(res.status, await safeText(res));
      }
      return (await res.json()) as T;
    });
    return { ok: true, data, cached: wasCached };
  } catch (err) {
    if (err instanceof ProxyHttpError) {
      return { ok: false, status: err.status, error: err.message };
    }
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "Unknown upstream error",
    };
  }
}

class ProxyHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText || "Upstream error";
  }
}

/** Build a JSON Response from a ProxyResult, mapping errors to HTTP. */
export function proxyResponse<T>(result: ProxyResult<T>): Response {
  if (result.ok) {
    return Response.json(
      { data: result.data, cached: result.cached },
      {
        status: 200,
        headers: { "x-proxy-cached": result.cached ? "1" : "0" },
      },
    );
  }
  return Response.json(
    { error: result.error },
    { status: result.status >= 400 && result.status < 600 ? result.status : 502 },
  );
}

/** Read a server-only env var, throw a clear error if missing. */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Set it in .env.local for dev or in Vercel project settings for prod.`,
    );
  }
  return v;
}
