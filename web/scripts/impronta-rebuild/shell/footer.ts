/**
 * Impronta freeform shell — the FOOTER children trees (EN + ES).
 *
 * Exported as CHILDREN trees only: the seeder wraps each in the `site_footer`
 * landmark. Both locales are built from ONE structural builder
 * (`buildFooterTree` in `./shared-footer.ts`) with locale copy injected, so
 * EN and ES are structurally identical by construction.
 *
 * Layout: a 4-column editorial band (brand + contact, Explore, Divisions,
 * For Talent) over a tenant-bound social icon row and a hairlined legal row.
 * Columns collapse 4 -> 2 -> stacked across tablet / mobile.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import {
  buildFooterTree,
  FOOTER_EMAIL,
  type FooterCopy,
} from "./shared-footer";

const EN: FooterCopy = {
  locale: "en",
  logoAlt: "Impronta",
  tagline:
    "Premium talent for events, shoots and brand experiences across the Riviera Maya.",
  exploreHeading: "Explore",
  explore: [
    { label: "Home", href: "/" },
    { label: "Directory", href: "/directory" },
    { label: "About", href: "/p/about" },
    { label: "Contact", href: "/p/contact" },
    { label: "FAQ", href: "/p/faq" },
  ],
  divisionsHeading: "Divisions",
  divisions: [
    { label: "Fashion Models", href: "/p/fashion-models" },
    { label: "Hosts & Promoters", href: "/p/hosts-promoters" },
    { label: "Performers", href: "/p/performers" },
    { label: "Music & DJs", href: "/p/music-djs" },
  ],
  forTalentHeading: "For Talent",
  forTalent: [
    { label: "Become a Model", href: "/p/become-a-model" },
    { label: "For Clients", href: "/p/for-clients" },
  ],
  socialAriaLabel: "Social links",
  copyright: "© 2026 Impronta. All rights reserved.",
  legal: [
    { label: "Terms", href: "/p/terms" },
    { label: "Privacy", href: "/p/privacy" },
  ],
};

const ES: FooterCopy = {
  locale: "es",
  logoAlt: "Impronta",
  tagline:
    "Talento premium para eventos, producciones y experiencias de marca en la Riviera Maya.",
  exploreHeading: "Explora",
  explore: [
    { label: "Inicio", href: "/" },
    { label: "Directorio", href: "/directory" },
    { label: "Nosotros", href: "/p/about" },
    { label: "Contacto", href: "/p/contact" },
    { label: "Preguntas Frecuentes", href: "/p/faq" },
  ],
  divisionsHeading: "Divisiones",
  // Restored: these pointed at /directory while the Spanish landings did not
  // exist. They do now, and the seeder's dead-link preflight verifies it on
  // every write rather than trusting this comment.
  divisions: [
    { label: "Modelos de Moda", href: "/p/fashion-models" },
    { label: "Anfitriones y Promotores", href: "/p/hosts-promoters" },
    { label: "Performers", href: "/p/performers" },
    { label: "Música y DJs", href: "/p/music-djs" },
  ],
  forTalentHeading: "Para Talento",
  forTalent: [
    { label: "Postúlate como Talento", href: "/p/become-a-model" },
    { label: "Para Clientes", href: "/p/for-clients" },
  ],
  socialAriaLabel: "Redes sociales",
  copyright: "© 2026 Impronta. Todos los derechos reservados.",
  legal: [
    { label: "Términos", href: "/p/terms" },
    { label: "Privacidad", href: "/p/privacy" },
  ],
};

// Both locales share the SAME verified contact channels; re-exported here so
// the seeder / tests read the canonical values from one place.
export { FOOTER_EMAIL };

export const improntaFooterTree: { en: BuilderNode[]; es: BuilderNode[] } = {
  en: buildFooterTree(EN),
  es: buildFooterTree(ES),
};
