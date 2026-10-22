/**
 * Workspace public pages (path-addressed `/w/<slug>` and agency custom hosts)
 * speak the WORKSPACE's language, not the platform default (TUL-699).
 *
 * Precedence: an explicit `/es` | `/en` prefix or `?lang`, then the workspace's
 * own language, then the platform default. Pure, so the rule is testable
 * without a request. The server read lives in
 * `lib/site-admin/server/workspace-page-locale.ts`.
 */

export const WORKSPACE_HOST_KIND_HEADER = "x-impronta-host-context";

/** Language of the platform starter storefront a page-less workspace renders. */
export const PLATFORM_STARTER_LOCALE = "es";

export interface WorkspaceLocaleFacts {
  /** `agency_business_identity.default_locale`, when the row exists. */
  identityDefault: string | null;
  /** Locale of the workspace's published home page, when it has one. */
  homeCmsLocale: string | null;
  /** True when the workspace renders the platform starter (no home page). */
  usesPlatformStarter: boolean;
  /** Locales the workspace publishes (identity), empty when unknown. */
  supported: readonly string[];
}

/** The workspace's own language: identity, else home page, else starter. */
export function workspaceContentLocale(f: WorkspaceLocaleFacts, platformDefault: string): string {
  if (f.identityDefault) return f.identityDefault;
  if (f.homeCmsLocale) return f.homeCmsLocale;
  if (f.usesPlatformStarter) return PLATFORM_STARTER_LOCALE;
  return platformDefault;
}

/** First path segment, skipping a `/w/<slug>` prefix. */
function leadingSegment(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return (parts[0] === "w" ? parts[2] : parts[0]) ?? "";
}

/** The locale the URL asks for explicitly, or null when it says nothing. */
export function explicitUrlLocale(
  pathname: string | null | undefined,
  search: string | null | undefined,
  publicLocales: readonly string[],
): string | null {
  const seg = leadingSegment(pathname ?? "");
  if (seg && publicLocales.includes(seg)) return seg;
  const lang = new URLSearchParams((search ?? "").replace(/^\?/, "")).get("lang");
  return lang && publicLocales.includes(lang) ? lang : null;
}

/** Final locale for a workspace public request, or null to keep the caller's. */
export function resolveWorkspacePageLocale(input: {
  hostKind: string | null | undefined;
  explicit: string | null;
  facts: WorkspaceLocaleFacts | null;
  platformDefault: string;
}): string | null {
  if (input.hostKind !== "agency" || !input.facts) return null;
  if (input.explicit) return input.explicit;
  const own = workspaceContentLocale(input.facts, input.platformDefault);
  const { supported } = input.facts;
  return supported.length === 0 || supported.includes(own) ? own : input.platformDefault;
}

const DASHBOARD_ROOTS = new Set(["talent", "admin", "client", "account"]);

/**
 * True for signed-in dashboard surfaces: `/talent…`, `/admin…`, `/client…`,
 * `/account…`, and the tenant-scoped `/<slug>/admin…` / `/<slug>/client…`.
 * Optional leading `/es` | `/en` prefix is ignored. Public workspace pages
 * (`/w/<slug>`, `/`, `/directory`) are NOT dashboards.
 */
export function isDashboardSurfacePath(pathname: string | null | undefined): boolean {
  const parts = (pathname ?? "").split("?")[0]!.split("/").filter(Boolean);
  if (parts[0] === "es" || parts[0] === "en") parts.shift();
  if (parts.length === 0 || parts[0] === "w") return false;
  if (DASHBOARD_ROOTS.has(parts[0]!)) return true;
  return parts.length >= 2 && (parts[1] === "admin" || parts[1] === "client");
}

/**
 * TUL-1229: whether `getRequestLocale` may let the workspace's language decide.
 * A dashboard is the user's own UI: once they switched language (cookie), the
 * workspace default must not override it, or the dashboard stays Spanish on a
 * Spanish workspace after switching to EN. Precedence there: explicit URL ->
 * language cookie -> workspace/profile language -> default. Public workspace
 * pages keep the TUL-699 rule unchanged.
 */
export function workspaceLocaleBranchApplies(input: {
  pathname: string | null | undefined;
  cookieLocale: string | null | undefined;
  publicLocales: readonly string[];
}): boolean {
  if (!isDashboardSurfacePath(input.pathname)) return true;
  const c = input.cookieLocale?.trim();
  return !(c && input.publicLocales.includes(c));
}
