/**
 * blog-index-cards.ts — which cards the `blog_index` section shows
 * (Posts v1, TUL-1008). PURE and client-safe.
 *
 *   source "live"   → real posts (the "Últimos posts" list)
 *   source "manual" → the editor-managed list (legacy sections: no `source`
 *                     field and a non-empty `posts` list keep working as before)
 *
 * Live with no real posts: the builder (preview) shows demo cards so the
 * section is never an empty hole while designing; the public site shows
 * nothing (the section renders no markup).
 */

export type BlogCard = {
  title: string;
  excerpt?: string;
  date?: string;
  category?: string;
  imageUrl?: string;
  imageAlt?: string;
  href: string;
};

export type BlogIndexSource = "live" | "manual";

export type BlogIndexSourceProps = {
  source?: BlogIndexSource;
  posts?: readonly BlogCard[];
};

/** Legacy sections have `posts` and no `source`: they stay manual. */
export function effectiveBlogIndexSource(props: BlogIndexSourceProps): BlogIndexSource {
  if (props.source) return props.source;
  return props.posts && props.posts.length > 0 ? "manual" : "live";
}

const DEMO_COPY = {
  es: [
    { title: "Cómo preparar tu primera sesión", excerpt: "Lo que conviene saber antes de reservar.", category: "Consejos", date: "Hoy" },
    { title: "Lo que hay detrás de mi trabajo", excerpt: "Una mirada al proceso, paso a paso.", category: "Proceso", date: "Ayer" },
    { title: "Preguntas frecuentes, respondidas", excerpt: "Precios, tiempos y cómo trabajamos juntos.", category: "Guía", date: "Esta semana" },
  ],
  en: [
    { title: "How to prepare for your first session", excerpt: "What to know before you book.", category: "Tips", date: "Today" },
    { title: "Behind the scenes of my work", excerpt: "A look at the process, step by step.", category: "Process", date: "Yesterday" },
    { title: "Frequently asked questions, answered", excerpt: "Prices, timing and how we work together.", category: "Guide", date: "This week" },
  ],
} as const;

/** Demo cards for the builder's empty state. They link nowhere. */
export function demoBlogCards(locale: string, count: number): BlogCard[] {
  const copy = DEMO_COPY[locale === "es" ? "es" : "en"];
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({ ...copy[i % copy.length]!, href: "#" }));
}

export function resolveBlogIndexCards(input: {
  props: BlogIndexSourceProps;
  /** Real posts already loaded for the current site (empty when none). */
  live: readonly BlogCard[];
  limit: number;
  preview: boolean;
  locale: string;
}): BlogCard[] {
  const { props, live, limit, preview, locale } = input;
  if (effectiveBlogIndexSource(props) === "manual") return [...(props.posts ?? [])];
  if (live.length > 0) return live.slice(0, limit);
  return preview ? demoBlogCards(locale, limit) : [];
}
