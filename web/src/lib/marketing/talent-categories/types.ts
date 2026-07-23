import type { MarketingPhoto } from "@/lib/marketing/photography";

/**
 * Talent-category landing pages (`/for/{slug}`).
 *
 * Pillar A of the organic content plan (`docs/_seo-run/keyword-map.md`). One
 * page per kind of work, each showing what a booking actually looks like for
 * THAT category. Two-segment paths on purpose: `/for/models` can never collide
 * with a single-segment tenant slug.
 *
 * Every claim here must be true of the shipped product: a free page on a free
 * subdomain, a structured inquiry that becomes an offer, payment taken in the
 * booking chat, your own domain on a paid plan, and the shared discovery
 * network. Nothing aspirational, nothing invented.
 */

export type CategoryStep = { title: string; body: string };
export type CategoryFaq = { q: string; a: string };

export type CategoryContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  intro: string;
  steps: CategoryStep[];
  faq: CategoryFaq[];
};

export type TalentCategory = {
  slug: string;
  photo: MarketingPhoto;
  /** Sibling slugs cross-linked at the foot of the page. */
  related: string[];
  en: CategoryContent;
  es: CategoryContent;
};
