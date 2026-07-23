import type { MarketingPhoto } from "@/lib/marketing/photography";

/**
 * Educational resource articles (`/resources/{slug}`).
 *
 * Pillar D of the organic content plan. Each article answers a question
 * independent talent actually ask, in plain language, EN + ES, and links to at
 * most one product surface. These exist to be useful and citable, not to rank
 * for a keyword and sell: an article that would not help someone who never
 * signs up does not belong here.
 *
 * Claims must match the shipped product: a free page on a free subdomain, a
 * structured request that becomes a priced offer, payment taken in the booking
 * chat, your own domain on a paid plan, and the shared discovery network.
 */

export type ArticleSection = {
  heading: string;
  /** Paragraphs. Kept as an array so the renderer never has to parse markup. */
  body: string[];
};

export type ArticleFaq = { q: string; a: string };

export type ArticleContent = {
  eyebrow: string;
  title: string;
  /** Doubles as the meta description, so keep it a real sentence under ~155 chars. */
  subtitle: string;
  intro: string;
  sections: ArticleSection[];
  faq: ArticleFaq[];
};

export type ResourceArticle = {
  slug: string;
  photo: MarketingPhoto;
  /** ISO date this article was first published. Used for Article JSON-LD. */
  datePublished: string;
  /** Sibling slugs cross-linked at the foot of the article. */
  related: string[];
  en: ArticleContent;
  es: ArticleContent;
};
