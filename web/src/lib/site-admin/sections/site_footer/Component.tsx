import {
  presentationDataAttrs,
  presentationInlineStyles,
} from "../shared/presentation";
import type { SectionComponentProps } from "../types";
import type { SiteFooterV1 } from "./schema";

/**
 * Phase B.1 — public renderer for site_footer sections.
 *
 * Rendered exclusively as the footer slot of a tenant's site_shell row when
 * the snapshot-shell feature flag is on AND the tenant has a published
 * shell. Default tenants continue to render the existing
 * `PublicCmsFooterNav` until they opt in.
 *
 * Visual variants (standard/compact/rich) and tone (follow/light/deep) are
 * driven by data-attributes consumed by `.site-footer__*` rules in
 * `app/token-presets.css`.
 */
export function SiteFooterComponent({
  props,
}: SectionComponentProps<SiteFooterV1>) {
  const { brand, columns, social, legal, variant, tone, presentation } = props;
  const hasColumns = columns.length > 0;
  const hasSocial = social.length > 0;
  const hasLegal =
    Boolean(legal.copyright?.trim()) || legal.links.length > 0;

  return (
    <footer
      className="site-footer"
      data-variant={variant}
      data-tone={tone}
      {...presentationDataAttrs(presentation)}
      style={presentationInlineStyles(presentation)}
    >
      <div className="site-footer__inner">
        {(brand.label || brand.logoUrl || brand.tagline) && (
          <div className="site-footer__brand">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className="site-footer__brand-mark"
                src={brand.logoUrl}
                alt={brand.logoAlt ?? brand.label ?? ""}
                loading="lazy"
                decoding="async"
              />
            ) : null}
            {brand.label ? (
              <span className="site-footer__brand-label">{brand.label}</span>
            ) : null}
            {brand.tagline ? (
              <p className="site-footer__tagline">{brand.tagline}</p>
            ) : null}
          </div>
        )}
        {hasColumns ? (
          <div className="site-footer__columns">
            {columns.map((col, i) => (
              <div key={i} className="site-footer__column">
                <h3 className="site-footer__column-heading">{col.heading}</h3>
                <ul className="site-footer__column-list">
                  {col.links.map((link, j) => (
                    <li key={j} className="site-footer__column-item">
                      <a
                        className="site-footer__column-link"
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
        {hasSocial ? (
          <ul className="site-footer__social" aria-label="Social links">
            {social.map((s, i) => (
              <li key={i} className="site-footer__social-item">
                <a
                  className="site-footer__social-link"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-platform={s.platform}
                  aria-label={s.platform}
                >
                  {s.platform}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {hasLegal ? (
          <div className="site-footer__legal">
            {legal.copyright ? (
              <span className="site-footer__copyright">{legal.copyright}</span>
            ) : null}
            {legal.links.length > 0 ? (
              <ul className="site-footer__legal-list">
                {legal.links.map((link, i) => (
                  <li key={i} className="site-footer__legal-item">
                    <a className="site-footer__legal-link" href={link.href}>
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
