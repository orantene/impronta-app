/**
 * post-auth-return.ts — where /auth/confirm and /auth/callback send a visitor
 * after a successful sign-in (TUL-691 E1).
 *
 * A guest who claims an account or signs in from a talent or business site
 * must land back on THAT site and page, including custom domains. Before this
 * module both routes always redirected to `getAppUrl()` and `normalizeNextPath`
 * dropped any absolute `next`, so a claim started on `jorgelina.com` ended on
 * the app host's `/account`.
 *
 * Security model (never an open redirect):
 *   - A relative `next` must start with exactly one `/` (no `//`, no `/\`),
 *     so the browser can never read it as a protocol-relative URL.
 *   - An absolute `next` is honored only when it is http(s), carries no
 *     credentials, and its host is the request host OR a host the injected
 *     `isRegisteredHost` confirms (agency_domains / talent custom domains).
 *     Anything else falls back to today's app-host destination.
 *   - Workspace paths (/client, /account, /admin, ...) never stay on a site
 *     host: those hosts 404 them, so they keep going to the app host.
 *
 * Pure: the registry lookup is injected so tests run without a database.
 */

const WORKSPACE_ROOTS = new Set([
  "account",
  "admin",
  "auth",
  "client",
  "desk",
  "forgot-password",
  "login",
  "onboarding",
  "platform",
  "register",
  "talent",
  "update-password",
]);

const WORKSPACE_SUB_SURFACES = new Set(["admin", "client", "talent"]);

export type ParsedReturnTarget = {
  /** Lowercased hostname, no port. */
  host: string;
  /** scheme://host[:port] */
  origin: string;
  /** pathname + search (no fragment). */
  pathAndQuery: string;
};

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** A safe same-origin relative path, or null. */
export function safeRelativePath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return null;
  // Control chars / backslashes can be normalized into a host by browsers.
  if (/[\\\u0000-\u001f]/.test(v)) return null;
  return v;
}

/** Parse an absolute http(s) `next`; null for anything else. */
export function parseAbsoluteReturn(
  raw: string | null | undefined,
): ParsedReturnTarget | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!/^https?:\/\//i.test(v)) return null;
  if (/[\\\u0000-\u001f]/.test(v)) return null;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  return {
    host,
    origin: url.origin,
    pathAndQuery: `${url.pathname || "/"}${url.search}`,
  };
}

/** True for paths only the app/agency workspace serves (never a public site). */
export function isWorkspacePath(path: string): boolean {
  const pathname = (path.split(/[?#]/)[0] ?? "/").toLowerCase();
  const segments = pathname.split("/").filter(Boolean);
  // Drop a leading locale segment (`/es/...`).
  if (segments[0] && /^[a-z]{2}(-[a-z]{2})?$/.test(segments[0])) segments.shift();
  if (segments.length === 0) return false;
  if (WORKSPACE_ROOTS.has(segments[0]!)) return true;
  return segments.length >= 2 && WORKSPACE_SUB_SURFACES.has(segments[1]!);
}

export type ResolvePostAuthRedirectArgs = {
  /** Raw `next` query value, unnormalized. */
  rawNext: string | null | undefined;
  /** Origin of the /auth/* request, e.g. https://jorgelina.com */
  requestOrigin: string;
  /** Canonical app origin (getAppUrl()). */
  appUrl: string;
  /** Role-gated destination already computed by resolvePostAuthDestination. */
  destination: string;
  /** Registry check: agency_domains or a talent custom domain. */
  isRegisteredHost: (host: string) => Promise<boolean>;
};

/**
 * Absolute URL to redirect to after a successful sign-in.
 */
export async function resolvePostAuthRedirect(
  args: ResolvePostAuthRedirectArgs,
): Promise<string> {
  const appUrl = args.appUrl.replace(/\/$/, "");
  const fallback = `${appUrl}${args.destination}`;
  const requestHost = hostOf(args.requestOrigin);
  const appHost = hostOf(appUrl);

  const absolute = parseAbsoluteReturn(args.rawNext);
  if (absolute) {
    if (isWorkspacePath(absolute.pathAndQuery)) return fallback;
    if (absolute.host === appHost) return fallback;
    const allowed =
      absolute.host === requestHost || (await args.isRegisteredHost(absolute.host));
    return allowed ? `${absolute.origin}${absolute.pathAndQuery}` : fallback;
  }

  // Relative `next` on a site host: stay on that site for public pages.
  const relative = safeRelativePath(args.rawNext);
  if (relative && requestHost && requestHost !== appHost && !isWorkspacePath(relative)) {
    return `${args.requestOrigin.replace(/\/$/, "")}${relative}`;
  }
  return fallback;
}
