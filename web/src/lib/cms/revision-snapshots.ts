import type { Locale } from "@/i18n/config";

/** Editable CMS page fields only (no ids, timestamps, audit columns). */
export type CmsPageSnapshot = {
  locale: Locale;
  slug: string;
  template_key: string;
  title: string;
  status: "draft" | "published" | "archived";
  body: string;
  hero: Record<string, unknown>;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
  canonical_url: string | null;
};

export type CmsPostSnapshot = {
  locale: Locale;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: "draft" | "published" | "archived";
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
};

export function normalizeHeroJson(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function parseCmsPageSnapshot(raw: unknown): CmsPageSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const locale = o.locale === "es" || o.locale === "en" ? o.locale : null;
  if (!locale) return null;
  const slug = typeof o.slug === "string" ? o.slug : null;
  const template_key = typeof o.template_key === "string" ? o.template_key : null;
  const title = typeof o.title === "string" ? o.title : null;
  const status =
    o.status === "draft" || o.status === "published" || o.status === "archived"
      ? o.status
      : null;
  const body = typeof o.body === "string" ? o.body : null;
  if (!slug || !template_key || !title || !status || body == null) return null;
  return {
    locale,
    slug,
    template_key,
    title,
    status,
    body,
    hero: normalizeHeroJson(o.hero),
    meta_title: typeof o.meta_title === "string" ? o.meta_title : null,
    meta_description: typeof o.meta_description === "string" ? o.meta_description : null,
    og_title: typeof o.og_title === "string" ? o.og_title : null,
    og_description: typeof o.og_description === "string" ? o.og_description : null,
    og_image_url: typeof o.og_image_url === "string" ? o.og_image_url : null,
    noindex: Boolean(o.noindex),
    include_in_sitemap: o.include_in_sitemap !== false,
    canonical_url: typeof o.canonical_url === "string" ? o.canonical_url : null,
  };
}

export function parseCmsPostSnapshot(raw: unknown): CmsPostSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const locale = o.locale === "es" || o.locale === "en" ? o.locale : null;
  if (!locale) return null;
  const slug = typeof o.slug === "string" ? o.slug : null;
  const title = typeof o.title === "string" ? o.title : null;
  const status =
    o.status === "draft" || o.status === "published" || o.status === "archived"
      ? o.status
      : null;
  const excerpt = typeof o.excerpt === "string" ? o.excerpt : "";
  const body = typeof o.body === "string" ? o.body : null;
  if (!slug || !title || !status || body == null) return null;
  return {
    locale,
    slug,
    title,
    excerpt,
    body,
    status,
    meta_title: typeof o.meta_title === "string" ? o.meta_title : null,
    meta_description: typeof o.meta_description === "string" ? o.meta_description : null,
    og_image_url: typeof o.og_image_url === "string" ? o.og_image_url : null,
    noindex: Boolean(o.noindex),
    include_in_sitemap: o.include_in_sitemap !== false,
  };
}
