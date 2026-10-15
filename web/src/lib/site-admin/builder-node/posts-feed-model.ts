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

// ── demo example posts ──────────────────────────────────────────────────────

/**
 * Platform imagery that ships in `/public/marketing/photos` (first-party,
 * root-relative so every tenant host serves it). The DB-backed
 * `platform_stock_images` pool needs a query; this pure fallback cannot make
 * one, so it uses the bundled platform photos.
 */
const PHOTO = (name: string) => `/marketing/photos/${name}.jpg`;

type DemoSeed = { es: [string, string, string]; en: [string, string, string]; img: string; min: number };

/** [title, excerpt, category] per locale. Six per trade. */
const DEMO: Record<PostsFeedDemoTrade, DemoSeed[]> = {
  general: [
    { es: ["Cómo trabajamos, paso a paso", "Del primer mensaje a la entrega, sin sorpresas.", "Proceso"], en: ["How we work, step by step", "From the first message to delivery, no surprises.", "Process"], img: PHOTO("mk-hero-business"), min: 4 },
    { es: ["Cinco preguntas antes de reservar", "Lo que conviene saber para elegir bien.", "Guía"], en: ["Five questions before you book", "What to know to choose well.", "Guide"], img: PHOTO("mk-audience-business"), min: 3 },
    { es: ["Detrás de un proyecto reciente", "Qué pedía el cliente y cómo lo resolvimos.", "Casos"], en: ["Behind a recent project", "What the client asked for and how we solved it.", "Stories"], img: PHOTO("agency-workspace-builder"), min: 5 },
    { es: ["Precios claros, sin letra chica", "Cómo armamos un presupuesto y qué incluye.", "Guía"], en: ["Clear prices, no fine print", "How we build a quote and what it includes.", "Guide"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Lo nuevo de esta temporada", "Servicios, horarios y novedades del equipo.", "Novedades"], en: ["New this season", "Services, hours and team news.", "News"], img: PHOTO("hub-agency-discovery"), min: 2 },
    { es: ["Preguntas frecuentes, respondidas", "Tiempos, pagos y cambios de fecha.", "Ayuda"], en: ["Frequently asked questions, answered", "Timing, payments and date changes.", "Help"], img: PHOTO("service-pros-lifestyle"), min: 4 },
  ],
  beauty: [
    { es: ["Cómo cuidar tu manicura una semana más", "Tres hábitos simples que hacen la diferencia.", "Cuidados"], en: ["Make your manicure last a week longer", "Three simple habits that make the difference.", "Aftercare"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Tendencias de color para esta temporada", "Los tonos que más piden en el estudio.", "Tendencias"], en: ["Colour trends for this season", "The shades clients ask for most.", "Trends"], img: PHOTO("talent-services-hero"), min: 4 },
    { es: ["Antes de tu primera cita", "Qué traer, cuánto dura y cómo prepararte.", "Guía"], en: ["Before your first appointment", "What to bring, how long it takes, how to prepare.", "Guide"], img: PHOTO("service-pros-lifestyle"), min: 3 },
    { es: ["Peinados para eventos que duran toda la noche", "Técnicas que resisten baile, calor y fotos.", "Eventos"], en: ["Event hair that lasts all night", "Techniques that survive dancing, heat and photos.", "Events"], img: PHOTO("mk-models-party"), min: 5 },
    { es: ["Mi kit de productos favoritos", "Lo que uso en el estudio y por qué.", "Productos"], en: ["My favourite product kit", "What I use in the studio and why.", "Products"], img: PHOTO("mk-audience-talent"), min: 4 },
    { es: ["Piel sana entre una cita y otra", "Rutina corta para mantener el resultado.", "Cuidados"], en: ["Healthy skin between appointments", "A short routine to keep the result.", "Aftercare"], img: PHOTO("mk-hero-business"), min: 3 },
  ],
  wellness: [
    { es: ["Diez minutos para bajar el estrés", "Una rutina de respiración para cualquier día.", "Bienestar"], en: ["Ten minutes to lower stress", "A breathing routine for any day.", "Wellbeing"], img: PHOTO("service-pros-lifestyle"), min: 3 },
    { es: ["Qué esperar de tu primer masaje", "Duración, presión y cómo comunicarte.", "Guía"], en: ["What to expect from your first massage", "Length, pressure and how to speak up.", "Guide"], img: PHOTO("mk-hero-service"), min: 4 },
    { es: ["Dormir mejor empieza de día", "Pequeños cambios con gran efecto en la noche.", "Hábitos"], en: ["Better sleep starts in the daytime", "Small changes with a big effect at night.", "Habits"], img: PHOTO("mk-audience-hub"), min: 5 },
    { es: ["Estiramientos para quien trabaja sentado", "Cuatro movimientos para cuello y espalda.", "Movimiento"], en: ["Stretches for desk workers", "Four moves for neck and back.", "Movement"], img: PHOTO("talent-services-hero"), min: 3 },
    { es: ["Por qué el descanso también es progreso", "Recuperarse es parte del proceso.", "Bienestar"], en: ["Why rest is progress too", "Recovery is part of the process.", "Wellbeing"], img: PHOTO("mk-audience-business"), min: 4 },
    { es: ["Rituales de fin de semana", "Ideas sencillas para empezar el lunes en calma.", "Hábitos"], en: ["Weekend rituals", "Simple ideas to start Monday calm.", "Habits"], img: PHOTO("agency-workspace-builder"), min: 2 },
  ],
  fitness: [
    { es: ["Tu primera semana de entrenamiento", "Un plan realista para empezar sin lesiones.", "Entrenamiento"], en: ["Your first training week", "A realistic plan to start without injury.", "Training"], img: PHOTO("mk-hero-perform"), min: 5 },
    { es: ["Qué comer antes de entrenar", "Opciones rápidas según la hora del día.", "Nutrición"], en: ["What to eat before training", "Quick options for any time of day.", "Nutrition"], img: PHOTO("service-pros-lifestyle"), min: 4 },
    { es: ["Fuerza en casa con lo mínimo", "Una rutina con banda y peso corporal.", "Entrenamiento"], en: ["Strength at home with the bare minimum", "A routine with a band and bodyweight.", "Training"], img: PHOTO("mk-audience-talent"), min: 4 },
    { es: ["Cómo medir tu progreso de verdad", "Más allá de la báscula.", "Progreso"], en: ["How to really measure progress", "Beyond the scale.", "Progress"], img: PHOTO("mk-hero-service"), min: 3 },
    { es: ["Movilidad: el hábito que nadie hace", "Cinco minutos que cambian tu entrenamiento.", "Movilidad"], en: ["Mobility: the habit nobody does", "Five minutes that change your training.", "Mobility"], img: PHOTO("mk-audience-hub"), min: 3 },
    { es: ["Entrenar en grupo vs. personal", "Cuál conviene según tu objetivo.", "Guía"], en: ["Group vs. personal training", "Which suits your goal.", "Guide"], img: PHOTO("event-night-beams"), min: 4 },
  ],
  food: [
    { es: ["El menú de temporada ya llegó", "Platos nuevos con producto local.", "Menú"], en: ["The seasonal menu is here", "New dishes with local produce.", "Menu"], img: PHOTO("mk-hosts-restaurant"), min: 3 },
    { es: ["Detrás de la cocina", "Un día con el equipo, del mercado al servicio.", "Equipo"], en: ["Behind the kitchen", "A day with the team, from market to service.", "Team"], img: PHOTO("mk-hero-business"), min: 5 },
    { es: ["Cómo reservar para grupos", "Mesas largas, menús cerrados y anticipos.", "Guía"], en: ["How to book for groups", "Long tables, set menus and deposits.", "Guide"], img: PHOTO("mk-audience-business"), min: 3 },
    { es: ["Maridajes fáciles para la casa", "Tres combinaciones que siempre funcionan.", "Recetas"], en: ["Easy pairings at home", "Three combinations that always work.", "Recipes"], img: PHOTO("service-pros-lifestyle"), min: 4 },
    { es: ["Noche de cocina en vivo", "Fechas, cupo y qué incluye la experiencia.", "Eventos"], en: ["Live cooking night", "Dates, places and what the experience includes.", "Events"], img: PHOTO("event-night-fire"), min: 2 },
    { es: ["Nuestros proveedores locales", "Quién cultiva lo que llega a tu plato.", "Origen"], en: ["Our local suppliers", "Who grows what reaches your plate.", "Sourcing"], img: PHOTO("mk-audience-hub"), min: 4 },
  ],
  events: [
    { es: ["Así se arma un show en vivo", "Del ensayo a la última canción.", "Detrás de escena"], en: ["How a live show comes together", "From rehearsal to the last song.", "Backstage"], img: PHOTO("event-night-beams"), min: 5 },
    { es: ["Cómo contratar música para tu evento", "Tiempos, sonido y lo que debes preguntar.", "Guía"], en: ["How to book music for your event", "Timing, sound and what to ask.", "Guide"], img: PHOTO("independent-singer-booking"), min: 4 },
    { es: ["La noche que no olvidamos", "Crónica de una fecha especial.", "Crónicas"], en: ["The night we will not forget", "The story of a special date.", "Stories"], img: PHOTO("event-night-fire"), min: 3 },
    { es: ["Vestuario y escena", "Cómo elegimos la imagen de cada presentación.", "Estilo"], en: ["Wardrobe and stage", "How we choose the look of each show.", "Style"], img: PHOTO("event-night-runway"), min: 3 },
    { es: ["Próximas fechas", "Dónde vernos este mes.", "Agenda"], en: ["Upcoming dates", "Where to see us this month.", "Agenda"], img: PHOTO("event-night-silks"), min: 2 },
    { es: ["Preguntas de quien organiza", "Rider técnico, horarios y anticipos.", "Guía"], en: ["Questions from organisers", "Tech rider, schedules and deposits.", "Guide"], img: PHOTO("mk-hero-perform"), min: 4 },
  ],
};

const DEMO_DATES = {
  es: ["Hoy", "Ayer", "Hace 3 días", "La semana pasada", "Hace 2 semanas", "El mes pasado"],
  en: ["Today", "Yesterday", "3 days ago", "Last week", "2 weeks ago", "Last month"],
} as const;

const DEMO_AUTHOR = { es: "Equipo", en: "The team" } as const;

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

/** Demo example cards. They link nowhere and say so (`demo: true`). */
export function demoPostsFeedCards(trade: PostsFeedDemoTrade, locale: string, count: number): PostsFeedCard[] {
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const seeds = DEMO[trade] ?? DEMO.general;
  return Array.from({ length: Math.max(0, Math.min(POSTS_FEED_MAX_FETCH, count)) }, (_, i) => {
    const seed = seeds[i % seeds.length]!;
    const [title, excerpt, category] = seed[lang];
    return {
      id: `demo-${trade}-${i + 1}`,
      path: "#",
      title,
      excerpt,
      category,
      date: DEMO_DATES[lang][i % DEMO_DATES[lang].length],
      imageUrl: seed.img,
      imageAlt: title,
      readingMinutes: seed.min,
      author: DEMO_AUTHOR[lang],
      featured: i === 0,
      demo: true,
    };
  });
}

/**
 * Which cards the widget shows. Real posts always win. Demo examples only when
 * there are NO real posts AND the caller allows demo (builder canvas, theme
 * preview, demo account); the published site of a real account never shows
 * invented posts.
 */
export function resolvePostsFeedCards(input: {
  live: PostsFeedNodeData | null | undefined;
  options: PostsFeedOptions;
  allowDemo: boolean;
  locale: string;
}): { cards: PostsFeedCard[]; total: number; demo: boolean } {
  const live = input.live;
  if (live && live.cards.length > 0) {
    return { cards: live.cards, total: Math.max(live.total, live.cards.length), demo: false };
  }
  if (!input.allowDemo) return { cards: [], total: 0, demo: false };
  const count = postsFeedFetchLimit(input.options);
  // Six demo posts per trade: never more pages than the examples fill.
  const cards = demoPostsFeedCards(input.options.demoTrade, input.locale, Math.min(count, 6));
  return { cards, total: cards.length, demo: true };
}
