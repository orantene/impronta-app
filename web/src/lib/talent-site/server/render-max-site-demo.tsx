import "server-only";

import { anyDemoTalent, DEMO_SITE_FOOTER } from "@/lib/talent/demo-talent";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveClientAccountMount } from "@/lib/client-account/gate";
import { SiteDemoBadge } from "@/lib/talent-site/site-demo-badge";

/** Demo talent (fictional theme example): true when this profile is a demo. */
export async function loadMaxSiteIsDemo(talentProfileId: string): Promise<boolean> {
  const demoDb = createServiceRoleClient();
  return demoDb ? await anyDemoTalent(demoDb, [talentProfileId]) : false;
}

/**
 * Floating Demo corner badge (TUL-516 P1). Fixed bottom-left via the floating
 * chrome stack — never a grey row above the theme header.
 */
export function MaxSiteDemoPill({ locale = "en" }: { locale?: string }) {
  return <SiteDemoBadge locale={locale} />;
}

/** The demo footer line, localized (es / en). */
export function MaxSiteDemoFooter({ locale }: { locale: string }) {
  return (
    <p
      data-talent-max-site-demo-footer=""
      style={{
        margin: 0,
        padding: "12px 16px 0",
        textAlign: "center",
        fontSize: 12,
        color: "var(--token-color-ink-muted, rgba(11,11,13,0.55))",
      }}
    >
      {locale.toLowerCase().startsWith("es") ? DEMO_SITE_FOOTER.es : DEMO_SITE_FOOTER.en}
    </p>
  );
}

/**
 * The header carries the site chrome: demo flag (the floating badge mounts from
 * the shell, not in-header) and the talent site's ES / EN switch. Site header only.
 */
export function withHeaderSiteChrome(
  sectionProps: unknown,
  sectionTypeKey: unknown,
  isDemo: boolean,
  /** The TALENT's languages, primary first. One language: no switch. */
  locales: readonly string[] = [],
  /** Each code -> this page in that language (talent URL grammar). */
  hrefs?: Readonly<Record<string, string>>,
  /** Paid Web Office only (TUL-240): the icons the header's `social` item shows. */
  social: readonly { platform: string; href: string; label: string }[] = [],
): unknown {
  if (sectionTypeKey !== "site_header" || !sectionProps || typeof sectionProps !== "object") return sectionProps;
  const list = locales.length > 1 ? locales.slice(0, 4) : [];
  return {
    ...(sectionProps as Record<string, unknown>),
    siteChrome: { demo: isDemo, ...(resolveClientAccountMount("talent").headerItem ? { account: true } : {}), locales: list, ...(list.length > 1 && hrefs ? { hrefs } : {}), ...(social.length ? { social: [...social] } : {}) },
  };
}
