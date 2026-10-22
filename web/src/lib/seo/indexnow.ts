/**
 * IndexNow (TUL-589, S slice): tells search engines a URL changed so they
 * recrawl it, instead of waiting for their own schedule. One shared helper
 * for every publish/unpublish hook — unpublishing also pings, since IndexNow
 * means "recrawl this", not "this now exists".
 *
 * Staging must never ping a real search engine on the platform's behalf, so
 * this only fires when `VERCEL_ENV === "production"` (Vercel's own signal,
 * not `NODE_ENV`, which is "production" for every deployed environment).
 */
import { logServerError } from "@/lib/server/safe-error";

export interface IndexNowEnv {
  VERCEL_ENV?: string;
  INDEXNOW_API_KEY?: string;
  /** Index signature so `process.env` (NodeJS.ProcessEnv) is assignable; a bare all-optional interface is a "weak type" that rejects it (TS2559). */
  [key: string]: string | undefined;
}

/** Pure + injectable so the production gate is unit-testable without mocking `process.env`. */
export function indexNowPingAllowed(env: IndexNowEnv = process.env): boolean {
  return env.VERCEL_ENV === "production" && !!env.INDEXNOW_API_KEY;
}

/** TUL-1777: the same URL is pinged at most once per window (a burst of publishes of one page is one ping). */
export const INDEXNOW_DEBOUNCE_MS = 60_000;
const recentPings = new Map<string, number>();

/** Test hook: forget the debounce memory. */
export function resetIndexNowDebounce(): void {
  recentPings.clear();
}

/**
 * TUL-1777: prod origin only. A preview/staging origin (`*.vercel.app`, `staging.*`, `qa-N.*`, localhost) is never
 * submitted to a real search engine, whatever `VERCEL_ENV` says on the instance that built the URL.
 */
export function indexNowHostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith(".vercel.app") || h === "localhost" || h.startsWith("localhost:")) return false;
  if (h.split(".").some((l) => l === "staging" || /^qa-\d+$/.test(l) || l === "preview")) return false;
  return true;
}

/** Drops URLs already pinged inside the window and records the rest. Pure apart from the module map. */
export function takeUnpinged(urls: string[], now: number = Date.now()): string[] {
  for (const [u, at] of recentPings) if (now - at >= INDEXNOW_DEBOUNCE_MS) recentPings.delete(u);
  const fresh = [...new Set(urls)].filter((u) => !recentPings.has(u));
  for (const u of fresh) recentPings.set(u, now);
  return fresh;
}

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** A slow api.indexnow.org must never hang a publish click (TUL-589 fix round). */
export const INDEXNOW_TIMEOUT_MS = 3000;
/** Matches the route at web/src/app/indexnow-key.txt/route.ts. */
export const INDEXNOW_KEY_LOCATION_PATH = "/indexnow-key.txt";

/**
 * Pings IndexNow with one or more absolute URLs that changed. Every URL must
 * share the same host — IndexNow's key is verified against a single host per
 * submission, and the key file is served at that host's `/indexnow-key.txt`.
 *
 * Best-effort and fire-and-forget: never throws. A publish/unpublish action
 * must succeed even if IndexNow is down or misconfigured, so every failure
 * (network, non-2xx, a mixed-host urls array) is logged and swallowed.
 */
export async function pingIndexNow(urls: string[], env: IndexNowEnv = process.env): Promise<void> {
  if (urls.length === 0) return;
  if (!indexNowPingAllowed(env)) return;

  let host: string;
  try {
    host = new URL(urls[0]!).host;
  } catch (err) {
    logServerError("seo.indexnow.ping.invalid_url", err);
    return;
  }
  if (urls.some((u) => {
    try {
      return new URL(u).host !== host;
    } catch {
      return true;
    }
  })) {
    logServerError("seo.indexnow.ping.mixed_hosts", new Error(`IndexNow urls must share one host; got ${JSON.stringify(urls)}`));
    return;
  }

  if (!indexNowHostAllowed(host)) return;
  urls = takeUnpinged(urls);
  if (urls.length === 0) return;

  const body = {
    host,
    key: env.INDEXNOW_API_KEY,
    keyLocation: `https://${host}${INDEXNOW_KEY_LOCATION_PATH}`,
    urlList: urls,
  };

  try {
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
    });
    // IndexNow returns 200/202 on success; treat anything else as a failure to log.
    if (!res.ok && res.status !== 202) {
      logServerError("seo.indexnow.ping.bad_status", new Error(`IndexNow responded ${res.status} for host ${host}`));
    }
  } catch (err) {
    logServerError("seo.indexnow.ping.request_failed", err);
  }
}

/** Convenience for the common single-URL hook call site. */
export async function pingIndexNowUrl(url: string | null | undefined, env: IndexNowEnv = process.env): Promise<void> {
  if (!url) return;
  await pingIndexNow([url], env);
}
