import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteHeaderV1 } from "./schema";
import { HeaderAuthArea } from "@/components/site-shell/HeaderAuthArea";
import type { Locale } from "@/i18n/config";

/**
 * Phase B — public renderer for site_header sections.
 *
 * Rendered as the header slot of a tenant's site_shell row when the
 * snapshot-shell feature flag is on AND the tenant has a published shell.
 * Tenants without a shell continue to render the hard-coded `PublicHeader`.
 *
 * Phase B.2 additions:
 * - Mounts `<HeaderAuthArea>` when any of the `authArea.show*` flags is
 *   true, preserving the legacy account menu / language toggle / discovery
 *   chrome alongside operator-edited content. Guardrail 5: no degraded
 *   tenant experience.
 * - Emits `data-section-id` so the EditShell selection layer can pick up
 *   header sections like body sections (Phase B.2.B will hook this up).
 *
 * Markup is intentionally conservative. The five visual variants
 * (standard/minimal/split × transparent/surface/solid × sticky/non-sticky)
 * are driven by data-attributes consumed by `.site-header__*` rules in
 * `app/token-presets.css`. Adding rules in B.1's CSS chunk lets us iterate
 * on chrome without touching this Component again.
 */
export function SiteHeaderComponent({
  props,
  sectionId,
  locale,
}: SectionComponentProps<SiteHeaderV1>) {
  const {
    brand,
    navItems,
    primaryCta,
    sticky,
    tone,
    variant,
    authArea,
    presentation,
  } = props;
  const brandHref = brand.href || "/";
  const showAccount = authArea?.showAccountMenu ?? true;
  const showLanguage = authArea?.showLanguageToggle ?? true;
  const showDiscovery = authArea?.showDiscoveryTools ?? true;
  const hasAuthArea = showAccount || showLanguage || showDiscovery;
  return (
    <header
      className="site-header"
      data-section-id={sectionId}
      data-section-type="site_header"
      data-variant={variant}
      data-tone={tone}
      data-sticky={sticky ? "true" : "false"}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-header__inner">
        <a className="site-header__brand" href={brandHref}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="site-header__brand-mark"
              src={brand.logoUrl}
              alt={brand.logoAlt ?? brand.label ?? ""}
              loading="eager"
              decoding="sync"
            />
          ) : null}
          {brand.label ? (
            <span className="site-header__brand-label">{brand.label}</span>
          ) : null}
        </a>
        {navItems.length > 0 ? (
          <nav className="site-header__nav" aria-label="Primary">
            <ul className="site-header__nav-list">
              {navItems.map((item, i) => (
                <li key={i} className="site-header__nav-item">
                  <a
                    className="site-header__nav-link"
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener noreferrer" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {primaryCta ? (
          <a
            className="site-header__cta site-btn site-btn--primary"
            href={primaryCta.href}
            target={primaryCta.external ? "_blank" : undefined}
            rel={primaryCta.external ? "noopener noreferrer" : undefined}
          >
            {primaryCta.label}
          </a>
        ) : null}
        {hasAuthArea ? (
          <HeaderAuthArea
            locale={locale as Locale}
            showAccountMenu={showAccount}
            showLanguageToggle={showLanguage}
            showDiscoveryTools={showDiscovery}
          />
        ) : null}
      </div>
    </header>
  );
}
