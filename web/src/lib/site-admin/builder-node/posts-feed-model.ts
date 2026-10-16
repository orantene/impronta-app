/**
 * posts-feed-model.ts: the `posts_feed` builder widget (Posts v1, PO1). PURE and
 * client-safe: option schema + defaults + validation, the 7 styles, pagination
 * math, the widget's own es/en copy, and the demo example posts shown when a
 * site has no posts yet (builder canvas, theme previews, demo accounts only).
 *
 * One kind, one engine, both builders: the talent builder and the agency
 * builder list the same `posts_feed` kind through their own gallery policy
 * (`registry-catalog-sections-connected-booking.ts`, filtered per site kind).
 *
 * The renderer never queries: the server caller resolves each node's cards
 * (`posts-feed-sources.ts`) and hands them over keyed by node id.
 */

// ── options ─────────────────────────────────────────────────────────────────

export const POSTS_FEED_STYLES = [
  "grid",
  "slider",
  "magazine",
  "list",
  "minimal",
  "bento",
  "hero",
] as const;
export type PostsFeedStyle = (typeof POSTS_FEED_STYLES)[number];

export const POSTS_FEED_SOURCES = ["latest", "featured", "hand_picked", "category"] as const;
export type PostsFeedSource = (typeof POSTS_FEED_SOURCES)[number];

export const POSTS_FEED_SORTS = ["newest", "oldest", "featured_first"] as const;
export type PostsFeedSort = (typeof POSTS_FEED_SORTS)[number];

export const POSTS_FEED_PAGINATION = ["none", "load_more"] as const;
export type PostsFeedPagination = (typeof POSTS_FEED_PAGINATION)[number];

export const POSTS_FEED_FIELDS = [
  "cover",
  "category",
  "date",
  "excerpt",
  "readingTime",
  "author",
  "readMore",
] as const;
export type PostsFeedField = (typeof POSTS_FEED_FIELDS)[number];
export type PostsFeedFields = Record<PostsFeedField, boolean>;

export const POSTS_FEED_DEMO_TRADES = ["general", "beauty", "wellness", "fitness", "food", "events"] as const;
export type PostsFeedDemoTrade = (typeof POSTS_FEED_DEMO_TRADES)[number];

/** Styles whose desktop column count is authorable. */
export const POSTS_FEED_COLUMN_STYLES: ReadonlySet<PostsFeedStyle> = new Set(["grid", "bento"]);

export const POSTS_FEED_LIMIT_MIN = 1;
export const POSTS_FEED_LIMIT_MAX = 24;
/** Pages the server pre-renders for load-more (the island reveals them). */
export const POSTS_FEED_MAX_PAGES = 4;
/** Hard cap on cards fetched for one node, whatever the pagination. */
export const POSTS_FEED_MAX_FETCH = 48;
export const POSTS_FEED_MAX_IDS = 48;

/** The stored props (all optional: `normalizePostsFeedOptions` fills defaults). */
export type PostsFeedProps = {
  /** Visual style (one of the 7). `style` is the shared node-style object. */
  layout?: PostsFeedStyle | "masonry";
  source?: PostsFeedSource;
  /** hand_picked: post ids in display order. */
  postIds?: string[];
  /** source=category: the one category (`cms_post_categories.id`). */
  categoryId?: string;
  /** Retired (tags are v1.1): old stored data is accepted and ignored. */
  tags?: string[];
  /** Never show these post ids. */
  excludeIds?: string[];
  limit?: number;
  sort?: PostsFeedSort;
  fields?: Partial<PostsFeedFields> & { /** Retired: ignored. */ tags?: boolean };
  pagination?: PostsFeedPagination | "numbered";
  /** grid / bento desktop columns. */
  columns?: 2 | 3 | 4;
  eyebrow?: string;
  title?: string;
  /** Shown on the published site when there are no posts (empty = hide the block). */
  emptyMessage?: string;
  /** Which demo example set the builder / theme preview shows when empty. */
  demoTrade?: PostsFeedDemoTrade;
};

export type PostsFeedOptions = {
  layout: PostsFeedStyle;
  source: PostsFeedSource;
  postIds: string[];
  categoryId: string | null;
  excludeIds: string[];
  limit: number;
  sort: PostsFeedSort;
  fields: PostsFeedFields;
  pagination: PostsFeedPagination;
  columns: 2 | 3 | 4;
  eyebrow: string;
  title: string;
  emptyMessage: string;
  demoTrade: PostsFeedDemoTrade;
};

export const POSTS_FEED_DEFAULT_FIELDS: PostsFeedFields = {
  cover: true,
  category: true,
  date: true,
  excerpt: true,
  readingTime: false,
  author: false,
  readMore: true,
};

export const POSTS_FEED_DEFAULTS: PostsFeedOptions = {
  layout: "grid",
  source: "latest",
  postIds: [],
  categoryId: null,
  excludeIds: [],
  limit: 6,
  sort: "newest",
  fields: { ...POSTS_FEED_DEFAULT_FIELDS },
  pagination: "none",
  columns: 3,
  eyebrow: "",
  title: "",
  emptyMessage: "",
  demoTrade: "general",
};

/** Default props a freshly inserted block stores (the rest stays default). */
export const POSTS_FEED_DEFAULT_PROPS: PostsFeedProps = {
  layout: "grid",
  source: "latest",
  limit: 6,
  sort: "newest",
  pagination: "none",
  columns: 3,
};

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

function cleanIds(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id.length > 64 || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function clampPostsFeedLimit(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : POSTS_FEED_DEFAULTS.limit;
  return Math.max(POSTS_FEED_LIMIT_MIN, Math.min(POSTS_FEED_LIMIT_MAX, n));
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/** Stored props (possibly partial or stale) → a complete, valid option set. */
export function normalizePostsFeedOptions(props: PostsFeedProps | null | undefined): PostsFeedOptions {
  const p = (props ?? {}) as Record<string, unknown>;
  const rawFields = (p.fields && typeof p.fields === "object" ? p.fields : {}) as Record<string, unknown>;
  const fields = { ...POSTS_FEED_DEFAULT_FIELDS };
  for (const f of POSTS_FEED_FIELDS) {
    if (typeof rawFields[f] === "boolean") fields[f] = rawFields[f] as boolean;
  }
  // Legacy: the retired "masonry" style maps explicitly to grid.
  const layout = p.layout === "masonry" ? "grid" : oneOf(POSTS_FEED_STYLES, p.layout, POSTS_FEED_DEFAULTS.layout);
  // Minimal is text-only by definition.
  if (layout === "minimal") fields.cover = false;
  const columns: 2 | 3 | 4 =
    p.columns === 2 || p.columns === 3 || p.columns === 4 ? (p.columns as 2 | 3 | 4) : POSTS_FEED_DEFAULTS.columns;
  const categoryId = typeof p.categoryId === "string" && p.categoryId.trim() ? p.categoryId.trim() : null;
  return {
    layout,
    source: oneOf(POSTS_FEED_SOURCES, p.source, POSTS_FEED_DEFAULTS.source),
    postIds: cleanIds(p.postIds, POSTS_FEED_MAX_IDS),
    categoryId,
    excludeIds: cleanIds(p.excludeIds, POSTS_FEED_MAX_IDS),
    limit: clampPostsFeedLimit(p.limit),
    sort: oneOf(POSTS_FEED_SORTS, p.sort, POSTS_FEED_DEFAULTS.sort),
    fields,
    // Numbered pages belong on /blog only; a stored "numbered" becomes load_more.
    pagination:
      p.pagination === "numbered" ? "load_more" : oneOf(POSTS_FEED_PAGINATION, p.pagination, POSTS_FEED_DEFAULTS.pagination),
    columns,
    eyebrow: text(p.eyebrow, 80),
    title: text(p.title, 160),
    emptyMessage: text(p.emptyMessage, 240),
    demoTrade: oneOf(POSTS_FEED_DEMO_TRADES, p.demoTrade, POSTS_FEED_DEFAULTS.demoTrade),
  };
}

/** How many cards the server fetches for one node (pages pre-rendered for the island). */
export function postsFeedFetchLimit(o: Pick<PostsFeedOptions, "limit" | "pagination">): number {
  const pages = o.pagination === "none" ? 1 : POSTS_FEED_MAX_PAGES;
  return Math.min(POSTS_FEED_MAX_FETCH, o.limit * pages);
}

/** Split already-fetched cards into pages of `limit`. */
export function chunkPostsFeedPages<T>(cards: readonly T[], limit: number): T[][] {
  const per = Math.max(1, Math.trunc(limit));
  const pages: T[][] = [];
  for (let i = 0; i < cards.length; i += per) pages.push(cards.slice(i, i + per));
  return pages.length > 0 ? pages : [[]];
}

// ── cards ───────────────────────────────────────────────────────────────────

/** One card the widget draws. Locale-free path in `path`; the renderer builds the href. */
export type PostsFeedCard = {
  id: string;
  /** Locale-free path (`/blog/<slug>`), or "#" for demo cards. */
  path: string;
  title: string;
  excerpt?: string;
  date?: string;
  category?: string;
  imageUrl?: string;
  imageAlt?: string;
  readingMinutes?: number;
  author?: string;
  featured?: boolean;
  demo?: boolean;
};

/** What the server resolved for one node. */
export type PostsFeedNodeData = {
  cards: PostsFeedCard[];
  /** Matching posts before the fetch cap (for page counts). */
  total: number;
  /** True when `cards` are example posts (a demo account's empty site), not real ones. */
  demo?: boolean;
};

// ── copy (es + en; no em dashes) ────────────────────────────────────────────

export const POSTS_FEED_COPY = {
  es: {
    readMore: "Leer más",
    loadMore: "Ver más posts",
    minutes: (n: number) => `${n} min de lectura`,
    demoNote: "Posts de ejemplo. Tus posts publicados aparecen aquí.",
    emptyEditor: "Todavía no hay posts publicados. Los visitantes no ven este bloque hasta que publiques uno.",
    by: "Por",
    sliderLabel: "Posts",
  },
  en: {
    readMore: "Read more",
    loadMore: "Show more posts",
    minutes: (n: number) => `${n} min read`,
    demoNote: "Example posts. Your published posts show here.",
    emptyEditor: "No published posts yet. Visitors do not see this block until you publish one.",
    by: "By",
    sliderLabel: "Posts",
  },
} as const;

export type PostsFeedCopy = (typeof POSTS_FEED_COPY)["en"] | (typeof POSTS_FEED_COPY)["es"];

export function postsFeedCopy(locale: string | null | undefined): PostsFeedCopy {
  return (locale ?? "").toLowerCase().startsWith("es") ? POSTS_FEED_COPY.es : POSTS_FEED_COPY.en;
}

/** Inspector labels (es + en) for the 7 styles. */
export const POSTS_FEED_STYLE_LABELS: Record<PostsFeedStyle, { es: string; en: string }> = {
  grid: { es: "Cuadrícula", en: "Grid" },
  slider: { es: "Carrusel", en: "Slider" },
  magazine: { es: "Revista", en: "Magazine" },
  list: { es: "Lista", en: "List" },
  minimal: { es: "Mínimo", en: "Minimal" },
  bento: { es: "Bento", en: "Bento" },
  hero: { es: "Destacado", en: "Hero" },
};

/** Map a business family (business-types.ts) to the demo set it should show. */
export function postsFeedDemoTradeForFamily(family: string | null | undefined): PostsFeedDemoTrade {
  switch (family) {
    case "beauty":
      return "beauty";
    case "wellness":
      return "wellness";
    case "fitness":
    case "education":
      return "fitness";
    case "dining":
    case "hospitality":
      return "food";
    case "events":
    case "agency":
      return "events";
    default:
      return "general";
  }
}

/** Example posts per trade (see `posts-feed-demo.ts`). */
export const POSTS_FEED_DEMO_PER_TRADE = 6;

/** How many example cards a widget wants: never more pages than the examples fill. */
export function postsFeedDemoCount(o: Pick<PostsFeedOptions, "limit" | "pagination">): number {
  return Math.min(postsFeedFetchLimit(o), POSTS_FEED_DEMO_PER_TRADE);
}

/**
 * Which cards the widget shows. This is pure and never invents posts: it shows
 * what the caller resolved. Example posts arrive as `live.demo === true`, put
 * there by the SERVER (a demo account's site, `posts-feed-sources.ts`) or, in
 * the builder canvas, by the small client island that fetches them through a
 * server action. The example data itself lives in `posts-feed-demo.ts`, out of
 * the admin client bundle (TUL-1164). A published site of a real account never
 * shows invented posts.
 */
export function resolvePostsFeedCards(input: {
  live: PostsFeedNodeData | null | undefined;
}): { cards: PostsFeedCard[]; total: number; demo: boolean } {
  const live = input.live;
  if (live && live.cards.length > 0) {
    return { cards: live.cards, total: Math.max(live.total, live.cards.length), demo: live.demo === true };
  }
  return { cards: [], total: 0, demo: false };
}
