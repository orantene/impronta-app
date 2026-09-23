/**
 * Personal-website capability denial copy — the CLIENT-SAFE twin of
 * `SITE_DENIED_COPY` in `lib/server/talent-self-guard.ts`.
 *
 * That file starts with `import "server-only"`, so nothing under it is
 * reachable from a "use client" component (the bundler throws). Every talent
 * lock chip (Add page in the page switcher, the builder's Add control, the
 * SEO tab, the custom-domain panel) needs this exact en/es copy from client
 * code, so it is duplicated here as a small, pure, dependency-free module.
 *
 * Keep the STRINGS identical to `talent-self-guard.ts`'s `SITE_DENIED_COPY` —
 * that file remains the canonical source for server-side refusals; this one
 * exists only because of the client/server boundary, not because the copy is
 * allowed to drift. Named for the one paid tier: Web Office. No em dashes.
 */

export type TalentSiteDeniedCapability =
  | "site_pages"
  | "site_sections"
  | "site_seo"
  | "site_analytics"
  | "site_custom_domain"
  | "site_edit"
  | "design_presets";

const SITE_DENIED_COPY: Record<TalentSiteDeniedCapability, { en: string; es: string }> = {
  site_pages: {
    en: "Extra pages are part of Web Office. Upgrade to add pages to your website.",
    es: "Las páginas adicionales son parte de Web Office. Mejora tu plan para añadir páginas a tu sitio.",
  },
  site_sections: {
    en: "Adding sections and blocks is part of Web Office. Upgrade to build beyond your free layout.",
    es: "Añadir secciones y bloques es parte de Web Office. Mejora tu plan para ir más allá de tu diseño gratuito.",
  },
  site_seo: {
    en: "SEO settings are part of Web Office. Upgrade to control how your site appears in search.",
    es: "Los ajustes de SEO son parte de Web Office. Mejora tu plan para controlar cómo aparece tu sitio en las búsquedas.",
  },
  site_analytics: {
    en: "Website analytics are part of Web Office. Upgrade to see how visitors use your site.",
    es: "Las estadísticas del sitio son parte de Web Office. Mejora tu plan para ver cómo usan tu sitio las visitas.",
  },
  site_custom_domain: {
    en: "A custom domain is part of Web Office. Upgrade to connect your own address.",
    es: "Un dominio propio es parte de Web Office. Mejora tu plan para conectar tu propia dirección.",
  },
  site_edit: {
    en: "You cannot edit this website right now.",
    es: "Ahora mismo no puedes editar este sitio.",
  },
  design_presets: {
    en: "You cannot change the design of this website right now.",
    es: "Ahora mismo no puedes cambiar el diseño de este sitio.",
  },
};

/** en + es refusal copy for a personal-website capability. Client-safe. */
export function siteCapabilityDeniedMessageClient(
  capability: TalentSiteDeniedCapability,
  locale?: string | null,
): string {
  const entry = SITE_DENIED_COPY[capability];
  return locale === "es" ? entry.es : entry.en;
}
