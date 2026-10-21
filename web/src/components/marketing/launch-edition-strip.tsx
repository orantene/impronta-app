import Link from "next/link";

import { withLocaleHref } from "@/i18n/pathnames";
import { loadLaunchEditionLink } from "@/lib/changelog/launch-edition-link";

import { MarketingContainer } from "./container";

/**
 * Slim strip above the home hero linking to the Launch Edition (TUL-1482).
 * Renders nothing until the changelog is live, so nothing about the launch is
 * public before Oran signs off the copy and flips the switch.
 */
export async function LaunchEditionStrip({ locale }: { locale: string }) {
  const lang = locale === "es" ? "es" : "en";
  const link = await loadLaunchEditionLink(lang);
  if (!link) return null;
  return (
    <div data-mkt-section="launch-edition" style={{ background: "var(--plt-bg-raised)", borderBottom: "1px solid var(--plt-hairline)" }}>
      <MarketingContainer size="wide" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2.5 text-center">
        <span className="plt-eyebrow" style={{ color: "var(--plt-muted)" }}>
          {link.eyebrow}
        </span>
        <Link
          href={withLocaleHref(link.path, lang)}
          className="plt-body underline underline-offset-2"
          style={{ fontSize: "0.875rem", color: "var(--plt-forest)" }}
        >
          {link.title} · {link.cta}
        </Link>
      </MarketingContainer>
    </div>
  );
}
