/**
 * 1D · "ready" is a claim about the real page. Fetch the address server-side
 * and require a 200 that contains the person's own name (so neither "Page not
 * found", "Host not registered" nor demo data reads as success). The fetch is
 * injected so the step is unit-testable.
 */

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
    console.warn(`[onboarding.verifyLive] LIVE_CHECK_ORIGIN refused (${reason}); host=${host}; using the default origin`);
    return input.defaultOrigin;
  };
  if (input.vercelEnv === "production" || input.vercelEnv === "preview") return refuse("VERCEL_ENV is production or preview");
  if (input.nodeEnv === "production") return refuse("NODE_ENV is production");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return refuse("not a valid URL");
  }
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
  const doFetch = input.fetchImpl ?? fetch;
  let target = input.url;
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
      headers["x-forwarded-host"] = orig.host;
    }
  } catch {
    /* unparsable url: the fetch below reports the failure */
  }
  try {
    const res = await doFetch(target, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs ?? 8000),
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
