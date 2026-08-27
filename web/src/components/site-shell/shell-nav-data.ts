/**
 * The shell nav drawer's DATA (social links + locale rows).
 *
 * Lives beside `PublishedShell.tsx` rather than inside it: that file renders
 * the shell and sits on the 800-line ratchet, so an unrelated one-line change
 * there was turning CI red for a reason that had nothing to do with the change.
 * This is data resolution, not rendering, and both render paths call it.
 */
import { withLocaleHref } from "@/i18n/pathnames";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { resolveShellSocialContact } from "@/lib/site-admin/server/shell-social-contact";
import type { Locale } from "@/lib/site-admin/locales";

/**
 * Data the shell's NAV drawer can ask for.
 *
 * Both of these were reachable from the schema and reachable from the panel,
 * and reached the renderer as nothing at all: `dataSources.socialLinks` had no
 * producer anywhere in the codebase (so a `social_links` node "bound" to
 * workspace_social_links silently fell back to its static links), and
 * `availableLocales` was a render option no caller supplied. The drawer then
 * correctly rendered nothing — which is indistinguishable from the feature not
 * existing.
 */
export async function resolveShellNavData(
  tenantId: string,
  locale: Locale,
  publicPathPrefix: string,
): Promise<{
  socialLinks: ReadonlyArray<{ platform: string; href: string; label?: string }>;
  availableLocales: ReadonlyArray<{ code: string; href: string; current?: boolean }>;
}> {
  const [social, localeSettings] = await Promise.all([
    resolveShellSocialContact({ tenantId }).catch(() => null),
    loadTenantLocaleSettings(tenantId).catch(() => null),
  ]);

  const supported = (localeSettings?.supportedLocales ?? []) as readonly string[];
  const defaultLocale = (localeSettings?.defaultLocale ?? "en") as string;

  return {
    socialLinks: (social?.socialLinks ?? []).map((link: {
      platform: string;
      href: string;
      label?: string | null;
    }) => ({
      platform: link.platform,
      href: link.href,
      label: link.label ?? undefined,
    })),
    // One row per locale the tenant actually publishes. The DEFAULT locale is
    // unprefixed; every other one carries its segment — the same grammar the
    // language widget uses, so the two cannot disagree.
    availableLocales: supported.map((code) => ({
      code,
      href:
        code === defaultLocale
          ? publicPathPrefix || "/"
          : `${publicPathPrefix}/${code}`,
      current: code === locale,
    })),
  };
}

