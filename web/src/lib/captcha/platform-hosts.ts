/**
 * Which request hosts the PLATFORM captcha widget covers.
 *
 * Cloudflare Turnstile only renders on hostnames listed on the widget. The
 * platform widget lists `tulala.digital` + subdomains (and local dev). A
 * workspace on its OWN custom domain with no own captcha keys would inherit a
 * site key that cannot render there, so the guest could never submit. For
 * those hosts captcha resolves to "none" (no widget, verify is a no-op);
 * honeypot + rate limits still apply. Own keys always win.
 *
 * Pure: no I/O. `TURNSTILE_PLATFORM_HOSTS` is a comma-separated list; each
 * entry also matches its subdomains.
 */

const BUILT_IN_SUFFIXES = ["tulala.digital", "localhost"];
const BUILT_IN_EXACT = ["127.0.0.1", "[::1]", "::1"];

/** Lowercase, strip scheme/port/path/trailing dot. Returns null when empty. */
export function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = (raw.split(",")[0] ?? "").trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, "").split("/")[0] ?? "";
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    h = end >= 0 ? h.slice(0, end + 1) : h;
  } else if ((h.match(/:/g) ?? []).length === 1) {
    h = h.split(":")[0] ?? "";
  }
  h = h.replace(/\.$/, "");
  return h || null;
}

export function parsePlatformHostsEnv(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => normalizeHost(s.trim().replace(/^\*\./, "")))
    .filter((s): s is string => !!s);
}

function matchesSuffix(host: string, base: string): boolean {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * True when the platform captcha widget renders on this host. A missing host
 * (no request scope) is treated as platform-covered: unchanged behavior.
 */
export function isPlatformCaptchaHost(
  rawHost: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const host = normalizeHost(rawHost);
  if (!host) return true;
  if (BUILT_IN_EXACT.includes(host)) return true;
  const suffixes = [...BUILT_IN_SUFFIXES, ...parsePlatformHostsEnv(env.TURNSTILE_PLATFORM_HOSTS)];
  return suffixes.some((s) => matchesSuffix(host, s));
}

export type HostCaptchaChoice = "own" | "platform" | "none";

/**
 * The single decision shared by widget render and server verify:
 * own keys win; else the platform key on covered hosts; else none.
 */
export function chooseCaptchaSource(input: {
  ownUsable: boolean;
  host: string | null | undefined;
  env?: Record<string, string | undefined>;
}): HostCaptchaChoice {
  if (input.ownUsable) return "own";
  return isPlatformCaptchaHost(input.host, input.env ?? process.env) ? "platform" : "none";
}

/** Host of the current request from headers (x-forwarded-host first). */
export function hostFromHeaders(
  h: { get(name: string): string | null } | null | undefined,
): string | null {
  if (!h) return null;
  return normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
}
