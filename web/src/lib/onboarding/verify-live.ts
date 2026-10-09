/**
 * 1D · "ready" is a claim about the real page. Fetch the address server-side
 * and require a 200 that contains the person's own name (so neither "Page not
 * found", "Host not registered" nor demo data reads as success). The fetch is
 * injected so the step is unit-testable.
 */

import http from "node:http";
import https from "node:https";

export type LiveCheck =
  | { ok: true }
  | { ok: false; reason: "no_url" | "no_name" | "status" | "name_missing" | "network"; status?: number };

/**
 * LIVE_CHECK_ORIGIN lets the journey server (local dev against the isolated
 * Supabase target) fetch a just-built site through its own origin instead of
 * the public slug host, which does not exist for isolated-DB slugs. Honoured
 * only for a valid http(s) URL outside production/preview; otherwise the
 * default origin is used and a refused override is warned about loudly.
 */
export function resolveLiveCheckOrigin(input: {
  override: string | null | undefined;
  vercelEnv: string | null | undefined;
  nodeEnv: string | null | undefined;
  defaultOrigin: string;
}): string {
  const raw = (input.override ?? "").trim();
  if (!raw) return input.defaultOrigin;
  const refuse = (reason: string): string => {
    let host = "unparsable";
    try {
      host = new URL(raw).host || "unparsable";
    } catch {
      /* keep marker */
    }
    // eslint-disable-next-line no-console
    console.warn(`[onboarding.verifyLive] LIVE_CHECK_ORIGIN refused (${reason}); host=${host}; using the default origin`);
    return input.defaultOrigin;
  };
  if (input.vercelEnv === "production" || input.vercelEnv === "preview") return refuse("VERCEL_ENV is production or preview");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return refuse("not a valid URL");
  }
  // A production build served off Vercel (journey QA on `next start`) may point the
  // live check at loopback only; VERCEL_ENV is always set on Vercel, so it never applies there.
  const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
  if (input.nodeEnv === "production" && !(loopback && !input.vercelEnv)) return refuse("NODE_ENV is production");
  if (u.protocol !== "http:" && u.protocol !== "https:") return refuse("not an http(s) URL");
  return u.origin;
}

export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `fetch` (undici) silently drops a `host` header, so the local-origin override
 * cannot route a site by its slug with it. `node:http(s)` honours `host`.
 * Used only when LIVE_CHECK_ORIGIN is accepted (never in production/preview).
 * Follows up to 3 redirects on the same origin.
 */
function fetchViaNodeHttp(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  hops = 0,
): Promise<{ status: number; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method: "GET", headers, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      const loc = res.headers.location;
      if (status >= 300 && status < 400 && loc && hops < 3) {
        res.resume();
        const next = new URL(loc, u);
        if (next.origin !== u.origin) return resolve({ status, text: async () => "" });
        return resolve(fetchViaNodeHttp(next.toString(), headers, timeoutMs, hops + 1));
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status, text: async () => body });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

export async function verifyLivePage(input: {
  url: string | null;
  /** The person's own name (professional name, or business name). */
  name: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<LiveCheck> {
  if (!input.url) return { ok: false, reason: "no_url" };
  const needle = normalizeForMatch(input.name ?? "");
  if (!needle) return { ok: false, reason: "no_name" };
  const doFetch: typeof fetch | null = input.fetchImpl ?? null;
  let target = input.url;
  let viaLocalOrigin = false;
  const headers: Record<string, string> = { "user-agent": "TulalaOnboardingVerify/1" };
  try {
    const orig = new URL(input.url);
    const origin = resolveLiveCheckOrigin({
      override: process.env.LIVE_CHECK_ORIGIN,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
      defaultOrigin: orig.origin,
    });
    if (origin !== orig.origin) {
      // Same path on the local origin; the original host rides along so the app routes the site by its slug.
      target = `${origin}${orig.pathname}${orig.search}`;
      headers.host = orig.host;
      viaLocalOrigin = true;
      headers["x-forwarded-host"] = orig.host;
    }
  } catch {
    /* unparsable url: the fetch below reports the failure */
  }
  try {
    const timeoutMs = input.timeoutMs ?? 8000;
    const res =
      viaLocalOrigin && !doFetch
        ? await fetchViaNodeHttp(target, headers, timeoutMs)
        : await (doFetch ?? fetch)(target, {
            redirect: "follow",
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
            headers,
          });
    if (res.status !== 200) return { ok: false, reason: "status", status: res.status };
    const html = normalizeForMatch(await res.text());
    return html.includes(needle) ? { ok: true } : { ok: false, reason: "name_missing" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

/** A just-published site can lag a moment: a few spaced tries, then the truth. */
export async function verifyLivePageWithRetry(
  input: Parameters<typeof verifyLivePage>[0] & { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> },
): Promise<LiveCheck> {
  const attempts = input.attempts ?? 3;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: LiveCheck = { ok: false, reason: "network" };
  for (let i = 0; i < attempts; i++) {
    last = await verifyLivePage(input);
    if (last.ok || last.reason === "no_url" || last.reason === "no_name") return last;
    if (i < attempts - 1) await sleep(input.delayMs ?? 1500);
  }
  return last;
}

/**
 * "both" owns two pages (the workspace site and her own talent site). The
 * finish screen may say ready only when BOTH are real: the first failure wins.
 * A missing talent URL is a failure (`no_url`), never a skipped check.
 */
export function combineLiveChecks(workspace: LiveCheck, talent: LiveCheck | null): LiveCheck {
  if (!workspace.ok) return workspace;
  if (talent && !talent.ok) return talent;
  return { ok: true };
}
