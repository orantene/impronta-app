/**
 * Public content for the Stage 2 workspaces (PM addendum on #4214):
 *   SL  offering_slugs     (TUL-1324 / TUL-1594) readable, per-locale service page addresses for the seeded services and packages
 *   RV  client_reviews     (TUL-585) talent -> client reviews on pre-made, completed history bookings
 *   PO  cms_posts          eight published blog posts (4 ES + 4 EN, hreflang-linked) on a workspace that HAS a staging host
 *
 * Why POSTS are new rows on T1 and not the Group-6 posts: the Group-6 posts live in the Group-6 workspace (qa-fixture-g6-ws), which has no
 * staging host row of its own, and the Stage 2 guards forbid touching any non-fixture tenant (so we cannot give it one). T1 already has
 * s2-cantina.staging.tulala.digital from workspaceOps(), created the same way as every QA host row but for a fixture tenant, so its blog is
 * reachable at https://s2-cantina.staging.tulala.digital/blog/<slug> (ES) with the EN twin linked by translation_of.
 *
 * Nothing here is a sale: the history bookings have NO source inquiry, so the bookings_write_order trigger writes no order (it returns early);
 * no payment, refund or transaction row exists. Public talent_reviews are NOT seeded: their public rating counts only `verified_paid`
 * reviews, which a trigger derives from a paid booking_transactions row (that would be a fake payment).
 */
import { email, insert, isoDays, J, s2Id, userOps } from "./stage2-ops.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";
import { T4_TZ, T4_WS } from "./stage2-plan-t4.mjs";

/** Held migrations this file depends on (the live-schema probe decides; a blocked item is printed with its exact version + file). */
export const HELD_SLUGS = { probe: "offering_slugs.slug", version: "20261231418800", file: "supabase/migrations/_pending_pm/20261231418800_offering_slugs_supersedes_415800_tul1324.sql", item: "offering_slugs rows (service page addresses)" };
export const POSTS_V1 = { probe: "cms_posts.tags", version: "20261231400700", file: "supabase/migrations/20261231400700_posts_v1_blocks_categories_takedown.sql", item: "8 published blog posts (body_blocks, category, tags, translation_of)" };

const oid = (key) => s2Id(`offering:${key}`);
const scopeT = (talentKey) => `t:${s2Id(`talent:${talentKey}`)}`;
const scopeW = (wsKey) => `w:${s2Id(`workspace:${wsKey}`)}`;

/**
 * Service page slugs. owner_scope: `t:<talent_profile_id>` for a talent-owned service, `w:<tenant id>` for a workspace-owned one.
 * Readable, lower-case, per locale, no QA / test / E2E word. A scope + locale + slug is unique, so the same readable word may repeat across
 * scopes; the dry run still reads the table and refuses a slug held by a row that is not this seed's.
 * `history` rows (is_current false) are the old address of a renamed service; the app answers them with a 301 to the current one.
 */
export const SLUG_ROWS = [
  // T4 salon (English first), talent-owned
  { key: "t4-haircut", offering: "t4-haircut", scope: scopeT("t4-maya"), locale: "en", slug: "haircut" },
  { key: "t4-haircut-es", offering: "t4-haircut", scope: scopeT("t4-maya"), locale: "es", slug: "corte-de-cabello" },
  { key: "t4-haircut-old", offering: "t4-haircut", scope: scopeT("t4-maya"), locale: "en", slug: "classic-cut", current: false },
  { key: "t4-color", offering: "t4-color", scope: scopeT("t4-maya"), locale: "en", slug: "full-color" },
  { key: "t4-color-es", offering: "t4-color", scope: scopeT("t4-maya"), locale: "es", slug: "tinte-completo" },
  { key: "t4-bridal-trial", offering: "t4-bridal-trial", scope: scopeT("t4-maya"), locale: "en", slug: "bridal-hair-trial" },
  { key: "t4-bridal-trial-es", offering: "t4-bridal-trial", scope: scopeT("t4-maya"), locale: "es", slug: "prueba-de-peinado-de-novia" },
  { key: "t4-blowout", offering: "t4-blowout", scope: scopeT("t4-jordan"), locale: "en", slug: "blowout" },
  { key: "t4-blowout-es", offering: "t4-blowout", scope: scopeT("t4-jordan"), locale: "es", slug: "secado-y-peinado" },
  { key: "t4-kids", offering: "t4-kids", scope: scopeT("t4-jordan"), locale: "en", slug: "kids-haircut" },
  { key: "t4-kids-es", offering: "t4-kids", scope: scopeT("t4-jordan"), locale: "es", slug: "corte-infantil" },
  // T3 agency: the roster photographer's session, talent-owned
  { key: "t3-sesion", offering: "t3-sesion", scope: scopeT("t3-valeria"), locale: "es", slug: "sesion-de-fotos" },
  { key: "t3-sesion-en", offering: "t3-sesion", scope: scopeT("t3-valeria"), locale: "en", slug: "photo-session" },
  // T1 restaurant and T5 studio: workspace-owned packages / services
  { key: "t1-cena-show", offering: "t1-cena-show", scope: scopeW("t1"), locale: "es", slug: "cena-y-show" },
  { key: "t1-cena-show-en", offering: "t1-cena-show", scope: scopeW("t1"), locale: "en", slug: "dinner-and-show" },
  { key: "t1-tacos-exp", offering: "t1-tacos-exp", scope: scopeW("t1"), locale: "es", slug: "experiencia-de-tacos" },
  { key: "t1-tacos-exp-en", offering: "t1-tacos-exp", scope: scopeW("t1"), locale: "en", slug: "taco-experience" },
  { key: "clase-smoothie", offering: "clase-smoothie", scope: scopeW("t5"), locale: "es", slug: "clase-y-smoothie" },
  { key: "clase-smoothie-en", offering: "clase-smoothie", scope: scopeW("t5"), locale: "en", slug: "class-and-smoothie" },
  { key: "cama", offering: "cama", scope: scopeW("t5"), locale: "es", slug: "cama-de-playa" },
  { key: "cama-en", offering: "cama", scope: scopeW("t5"), locale: "en", slug: "beach-bed" },
];

export function planSlugs() {
  const fx = "SL";
  return SLUG_ROWS.map((r) =>
    insert(fx, "public.offering_slugs", `slug:${r.key}`, {
      id: s2Id(`slug:${r.key}`), offering_id: oid(r.offering), owner_scope: r.scope, locale: r.locale, slug: r.slug, is_current: r.current !== false,
    }),
  );
}

/**
 * Reviews. A completed haircut / color / bridal trial for one client, three bookings, one talent -> client review each (Maya Torres, who has
 * a login). A client_reviews row is unique per (booking, author, client); the author is the talent's login and the client is a seed client.
 * Bookings are marked as pre-made history in internal_notes, carry no source inquiry (so no order is written), and are dated in the past.
 */
export const REVIEW_BOOKINGS = [
  { key: "rv-1", offering: "t4-haircut", title: "Haircut", days: -34, minutes: 45, usd: 45, rating: 5, body: "Arrived on time, knew exactly what she wanted and was a pleasure to work with." },
  { key: "rv-2", offering: "t4-color", title: "Full color", days: -19, minutes: 120, usd: 120, rating: 4, body: "Great communication before the appointment. Ran a little late on the day but was gracious about it." },
  { key: "rv-3", offering: "t4-bridal-trial", title: "Bridal hair trial", days: -6, minutes: 90, usd: 150, rating: 5, body: "Brought clear reference photos and made decisions quickly. Easy and kind." },
];
export const REVIEW_CLIENT_EMAIL = email("rv-client");

export function planReviews(at) {
  const fx = "RV";
  const maya = s2Id("talent:t4-maya");
  const ops = [...userOps(fx, "rv-client", { email: REVIEW_CLIENT_EMAIL, name: "Priya Shah", appRole: "client" })];
  for (const b of REVIEW_BOOKINGS) {
    const starts = isoDays(at, b.days);
    const ends = new Date(new Date(starts).getTime() + b.minutes * 60000).toISOString();
    const booking = s2Id(`booking:${b.key}`);
    ops.push(
      insert(fx, "public.agency_bookings", `booking:${b.key}`, {
        id: booking, tenant_id: T4_WS, title: b.title, status: "completed", starts_at: starts, ends_at: ends, currency_code: "USD", payment_status: "paid",
        total_client_revenue: b.usd, contact_name: "Priya Shah", contact_email: REVIEW_CLIENT_EMAIL, client_user_id: s2Id("user:rv-client"),
        venue_name: "Brisa Hair Studio", venue_location_text: "Brisa Hair Studio, Miami", timezone: T4_TZ, source_type_snapshot: "manual",
        internal_notes: "Pre-made history: a completed visit seeded so the reviews screens have data. Not a sale; no payment or order exists.",
        event_date: starts.slice(0, 10),
      }),
      insert(fx, "public.booking_talent", `booking_talent:${b.key}`, {
        id: s2Id(`booking_talent:${b.key}`), tenant_id: T4_WS, booking_id: booking, talent_profile_id: maya, talent_name_snapshot: "Maya Torres", profile_code_snapshot: "TAL-96202",
        role_label: b.title, units: 1, talent_cost_rate: b.usd, client_charge_rate: b.usd, talent_cost_total: b.usd, client_charge_total: b.usd,
      }),
      insert(fx, "public.client_reviews", `review:${b.key}`, {
        id: s2Id(`review:${b.key}`), tenant_id: T4_WS, booking_id: booking, author_user_id: s2Id("user:t4-stylist"), author_talent_profile_id: maya,
        client_user_id: s2Id("user:rv-client"), rating: b.rating, body: b.body, status: "published",
      }),
    );
  }
  return ops;
}

/** Posts: four topics, each an ES original and an EN twin (translation_of -> the ES row). */
const BLOCK_ID = (post, n) => `${post}-${n}`;
const para = (post, n, text) => ({ id: BLOCK_ID(post, n), type: "paragraph", text });
const head = (post, n, text) => ({ id: BLOCK_ID(post, n), type: "heading", level: 2, text });
const faq = (post, n, question, answer) => ({ id: BLOCK_ID(post, n), type: "faq", question, answer });

export const POST_TOPICS = [
  {
    key: "reservar", offering: "t1-menu-cena", tags: ["reservas", "grupos"], tagsEn: ["bookings", "groups"], category: "guides", days: 12,
    es: { slug: "como-reservar-mesa", title: "Cómo reservar tu mesa en La Cantina del Puerto", excerpt: "Reserva en línea en menos de un minuto y consulta cuándo pedimos un depósito.", meta: "Cómo reservar mesa, depósito para grupos y política de cancelación." },
    en: { slug: "how-to-book-a-table", title: "How to book your table at La Cantina del Puerto", excerpt: "Book online in under a minute and see when we ask for a deposit.", meta: "How to book a table, group deposits and the cancellation policy." },
  },
  {
    key: "carta", offering: "t1-menu-cena", tags: ["menu", "temporada"], tagsEn: ["menu", "seasonal"], category: "guides", days: 9,
    es: { slug: "carta-de-temporada", title: "La carta de temporada ya está aquí", excerpt: "Platos nuevos con ingredientes frescos del puerto, disponibles esta temporada.", meta: "Conoce la carta de temporada de La Cantina del Puerto." },
    en: { slug: "seasonal-menu", title: "Our seasonal menu is here", excerpt: "New dishes with fresh ingredients from the port, available this season.", meta: "Discover the seasonal menu at La Cantina del Puerto." },
  },
  {
    key: "musica", offering: "t1-cena-show", tags: ["musica", "eventos"], tagsEn: ["music", "events"], category: "news", days: 6,
    es: { slug: "noches-de-musica-en-vivo", title: "Noches de música en vivo", excerpt: "Cena con espectáculo en el salón: así funcionan las noches de música.", meta: "Cena y show en vivo en La Cantina del Puerto." },
    en: { slug: "live-music-nights", title: "Live music nights", excerpt: "Dinner with a show in the dining room: how our music nights work.", meta: "Dinner and a live show at La Cantina del Puerto." },
  },
  {
    key: "privados", offering: "t1-tacos-exp", tags: ["eventos", "grupos"], tagsEn: ["events", "groups"], category: "news", days: 3,
    es: { slug: "eventos-privados-y-grupos", title: "Eventos privados y grupos", excerpt: "Celebra con nosotros: opciones para grupos pequeños y grandes.", meta: "Eventos privados y reservas para grupos en La Cantina del Puerto." },
    en: { slug: "private-events-and-groups", title: "Private events and groups", excerpt: "Celebrate with us: options for small and large groups.", meta: "Private events and group bookings at La Cantina del Puerto." },
  },
];

const BODIES = {
  reservar: {
    es: (p) => [
      para(p, 1, "Reservar es sencillo: elige la fecha, el número de personas y el horario, y recibes la confirmación por correo."),
      head(p, 2, "Preguntas frecuentes"),
      faq(p, 3, "¿Cuándo piden un depósito?", "Para grupos de seis personas o más pedimos un depósito por persona, que se descuenta de la cuenta."),
      faq(p, 4, "¿Puedo cancelar?", "Sí. Cancela sin costo hasta 24 horas antes de tu reserva."),
    ],
    en: (p) => [
      para(p, 1, "Booking is simple: pick the date, the party size and the time, and you get a confirmation by email."),
      head(p, 2, "Frequently asked questions"),
      faq(p, 3, "When do you ask for a deposit?", "For parties of six or more we ask for a deposit per person, which is deducted from the bill."),
      faq(p, 4, "Can I cancel?", "Yes. Cancel free of charge up to 24 hours before your booking."),
    ],
  },
  carta: {
    es: (p) => [para(p, 1, "Cada temporada renovamos la carta con productos frescos."), head(p, 2, "Lo nuevo"), para(p, 3, "Platos de la casa, entradas para compartir y postres de temporada.")],
    en: (p) => [para(p, 1, "Every season we refresh the menu with fresh produce."), head(p, 2, "What is new"), para(p, 3, "House dishes, starters to share and seasonal desserts.")],
  },
  musica: {
    es: (p, off) => [para(p, 1, "Las noches de música combinan una cena de tres tiempos con un espectáculo en vivo."), { id: BLOCK_ID(p, 2), type: "service", offering_id: off }, { id: BLOCK_ID(p, 3), type: "book_button", label: "Reservar", offering_id: off }],
    en: (p, off) => [para(p, 1, "Music nights pair a three-course dinner with a live show."), { id: BLOCK_ID(p, 2), type: "service", offering_id: off }, { id: BLOCK_ID(p, 3), type: "book_button", label: "Book now", offering_id: off }],
  },
  privados: {
    es: (p) => [para(p, 1, "Organizamos cumpleaños, reuniones de equipo y celebraciones familiares."), head(p, 2, "Cómo empezar"), para(p, 3, "Cuéntanos la fecha y el número de invitados y te preparamos una propuesta.")],
    en: (p) => [para(p, 1, "We host birthdays, team gatherings and family celebrations."), head(p, 2, "How to start"), para(p, 3, "Tell us the date and the number of guests and we will prepare a proposal.")],
  },
};

export const POST_CATEGORIES = [
  { key: "guides-es", locale: "es", slug: "guias", name: "Guías", position: 0 },
  { key: "guides-en", locale: "en", slug: "guides", name: "Guides", position: 0 },
  { key: "news-es", locale: "es", slug: "novedades", name: "Novedades", position: 1 },
  { key: "news-en", locale: "en", slug: "news", name: "News", position: 1 },
];

export function planPosts(at) {
  const fx = "PO";
  const owner = s2Id("user:t1-owner");
  const ops = POST_CATEGORIES.map((c) =>
    insert(fx, "public.cms_post_categories", `post-category:${c.key}`, { id: s2Id(`post-category:${c.key}`), tenant_id: T1_WS, locale: c.locale, slug: c.slug, name: c.name, position: c.position }),
  );
  for (const t of POST_TOPICS) {
    const off = oid(t.offering);
    const esId = s2Id(`post:${t.key}:es`);
    for (const locale of ["es", "en"]) {
      const c = t[locale];
      const key = `post:${t.key}:${locale}`;
      ops.push(
        insert(fx, "public.cms_posts", key, {
          id: s2Id(key), tenant_id: T1_WS, talent_profile_id: null, created_by: owner, updated_by: owner, author_profile_id: owner,
          locale, slug: c.slug, title: c.title, excerpt: c.excerpt, body: BODIES[t.key][locale](key, off).filter((b) => b.type === "paragraph").map((b) => b.text).join("\n\n"),
          body_blocks: J(BODIES[t.key][locale](key, off)), status: "published", published_at: isoDays(at, -t.days), meta_title: c.title, meta_description: c.meta,
          include_in_sitemap: true, noindex: false, is_unlisted: false, is_featured: t.key === "reservar", related_offering_id: off,
          category_id: s2Id(`post-category:${t.category}-${locale}`), tags: locale === "es" ? t.tags : t.tagsEn,
          ...(locale === "en" ? { translation_of: esId } : {}),
        }),
      );
    }
  }
  return ops;
}

/** The staging host the posts are served from (T1's own fixture subdomain). */
export const POSTS_HOST = "s2-cantina.staging.tulala.digital";
export const postUrls = () => POST_TOPICS.flatMap((t) => ["es", "en"].map((l) => `https://${POSTS_HOST}${l === "es" ? "" : "/en"}/blog/${t[l].slug}`));
