import type { TemplateMeta } from "../types";

/**
 * Homepage template slot definition.
 *
 * Every slot listed here becomes a valid `slot_key` on `cms_page_sections`.
 * The slot order below is the default vertical stack order on the public
 * storefront (when the server renders `snapshot.slots`, it iterates in this
 * order and resolves the sections assigned to each slot).
 *
 * **M7.1 additions** (all non-required so legacy tenants see no change):
 *   - `trust_band`       — typically a trust_strip section under the hero
 *   - `services`         — category_grid (Muse Bridal services)
 *   - `featured`         — featured talent / professionals
 *   - `process`          — how-it-works process section
 *   - `destinations`     — destinations_mosaic / service areas
 *   - `gallery`          — gallery strip
 *   - `testimonials`     — testimonials_trio / single-hero quote
 *   - `final_cta`        — cta_banner (emotional conversion block)
 *
 * A slot without `allowedSectionTypes` accepts ANY registered section,
 * which is the right default — we want admins to experiment freely. Only
 * the hero slot is typed because a non-hero section at the hero slot would
 * almost certainly break above-the-fold layout.
 */
export const homepageMeta: TemplateMeta = {
  key: "homepage",
  label: "Homepage",
  description:
    "Agency storefront homepage. System-owned (is_system_owned = true); slug is '' (empty) per locale; composed via cms_page_sections junction.",
  systemOwned: true,
  slots: [
    { key: "hero", label: "Hero", required: true, allowedSectionTypes: ["hero"] },
    { key: "trust_band", label: "Trust band (under hero)", required: false },
    { key: "services", label: "Services / categories", required: false },
    { key: "featured", label: "Featured professionals", required: false },
    { key: "process", label: "How it works / process", required: false },
    { key: "destinations", label: "Destinations / service areas", required: false },
    { key: "gallery", label: "Gallery / moments", required: false },
    { key: "testimonials", label: "Testimonials", required: false },
    /**
     * Legacy slots — kept for backward compatibility. Any tenant that has
     * saved content against `primary` / `secondary` / `footer-callout`
     * continues to render without migration.
     */
    { key: "primary", label: "Primary content (legacy)", required: false },
    { key: "secondary", label: "Secondary content (legacy)", required: false },
    { key: "final_cta", label: "Final CTA banner", required: false },
    { key: "footer-callout", label: "Footer callout (legacy)", required: false },
  ],
};
