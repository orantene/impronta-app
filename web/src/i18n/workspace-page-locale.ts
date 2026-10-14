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
