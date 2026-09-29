import "server-only";

import { anyDemoTalent, DEMO_SITE_FOOTER } from "@/lib/talent/demo-talent";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** Demo talent (fictional theme example): true when this profile is a demo. */
export async function loadMaxSiteIsDemo(talentProfileId: string): Promise<boolean> {
  const demoDb = createServiceRoleClient();
  return demoDb ? await anyDemoTalent(demoDb, [talentProfileId]) : false;
}

/** The Demo pill rendered above the site header. */
export function MaxSiteDemoPill() {
  return (
    <div
      data-talent-max-site-demo-pill=""
      style={{ display: "flex", justifyContent: "center", padding: "6px 16px 0" }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "2px 10px",
          borderRadius: 999,
          border: "1px solid currentColor",
          color: "var(--token-color-ink-muted, rgba(11,11,13,0.55))",
        }}
      >
        Demo
      </span>
    </div>
  );
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
 * The header carries the site chrome: the Demo pill (demo talents, the only
 * demo marker) and the talent site's ES / EN switch. Site header only.
 */
export function withHeaderSiteChrome(sectionProps: unknown, sectionTypeKey: unknown, isDemo: boolean): unknown {
  if (sectionTypeKey !== "site_header" || !sectionProps || typeof sectionProps !== "object") return sectionProps;
  return { ...(sectionProps as Record<string, unknown>), siteChrome: { demo: isDemo, locales: ["es", "en"] } };
}
