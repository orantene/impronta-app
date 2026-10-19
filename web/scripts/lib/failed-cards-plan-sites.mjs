/**
 * Pure planners for the workspace / site / catalog fixtures: F3 booking-ready studio (+ empty-state
 * twin), F5 promos, F6 Builder Lab sandbox, F10 bilingual area block, F12 taxonomy, F14 concierge
 * workspace + talent, S5 free-plan talent, S6 payout-country talents (Stripe accounts come later).
 */
import { PREFIX } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import {
  G6, HUB_TENANT_ID, J, STAGING_STORAGE_PUBLIC, STOCK_PATHS, clone, containerNode, fcBotEmail, fcEmail, insert, isoDays,
  mediaOp, offeringOps, talentOps, userOps,
} from "./failed-cards-ops.mjs";

export const STUDIO_SLUG = `${PREFIX}-studio`;
export const STUDIO2_SLUG = `${PREFIX}-studio-nohours`;
export const CONCIERGE_SLUG = `${PREFIX}-concierge`;
/** 46 characters: the long-name roster card (TUL-1167). */
export const LONG_TALENT_NAME = "Mariana Guadalupe Hernández de la Fuente Prueba";

const APPOINTMENTS = { enabled: true, allowTalentDirectBooking: true, terminology: "appointments", timezone: "America/Cancun" };

export function workspaceOps(fx, key, { slug, name, ownerUser, plan = "studio", logo = null, accent = null, at }) {
  const ws = fcId(`workspace:${key}`);
  const now = at.toISOString();
  const branding = logo ? { logo_url: logo, accent_color: accent } : undefined;
  return {
    ws,
    ops: [
      clone(fx, "public.agencies", `workspace:${key}`, G6.ws, {
        id: ws, slug, display_name: name, plan_tier: plan, talent_seat_limit: plan === "studio" ? 15 : null, workspace_type: "talent",
        default_currency: "MXN", preferred_currency: "mxn", timezone: "America/Cancun", supported_locales: ["es", "en"],
        settings: { appointments: APPOINTMENTS, ...(branding ? { branding } : {}) },
        onboarding_completed_at: now, created_at: now, updated_at: now, default_coordinator_user_id: null,
      }),
      clone(fx, "public.agency_memberships", `membership:${key}`, G6.membership, {
        id: fcId(`membership:${key}`), tenant_id: ws, profile_id: ownerUser, role: "owner", status: "active", invited_by: null,
        accepted_at: now, created_at: now, updated_at: now,
      }),
      insert(fx, "public.agency_business_identity", `identity:${key}`, {
        tenant_id: ws, public_name: name, default_locale: "es", supported_locales: ["es", "en"], tagline: "Limpieza a domicilio en Cancun",
      }, ["tenant_id"]),
      insert(fx, "public.agency_domains", `domain:${key}:sub`, {
        id: fcId(`domain:${key}:sub`), tenant_id: ws, hostname: `${slug}.staging.tulala.digital`, kind: "subdomain", is_primary: true,
        status: "active", verified_at: now, tenant_slug: slug,
      }),
    ],
  };
}

/** F3 (TUL-698, 1067, 1167, 870, 1016): booking-ready Studio workspace + a twin with services but no hours. */
export function planF3(now, { trees }) {
  const fx = "F3";
  const owner = userOps(fx, "f3-owner", { email: fcEmail("studio-owner"), name: "qa-fixture Dueña Studio", role: "agency_staff" });
  const ownerUser = fcId("user:f3-owner");
  const logo = `${STAGING_STORAGE_PUBLIC}/${STOCK_PATHS[0]}`;
  const accent = "#0F766E";
  const a = workspaceOps(fx, "f3", { slug: STUDIO_SLUG, name: "Estudio Brillo Cancún (prueba)", ownerUser, logo, accent, at: now });
  const b = workspaceOps(fx, "f3-nohours", { slug: STUDIO2_SLUG, name: "Estudio Sin Horario (prueba)", ownerUser, at: now });
  const ops = [...owner, ...a.ops, ...b.ops];
  ops.push(
    insert(fx, "public.agency_branding", "branding:f3", {
      tenant_id: a.ws, accent_color: accent, primary_color: accent,
      theme_json: J({ logo_url: logo, "color.accent": accent }), theme_json_draft: J({ logo_url: logo, "color.accent": accent }),
    }, ["tenant_id"]),
    insert(fx, "public.agency_domains", "domain:f3:custom", {
      id: fcId("domain:f3:custom"), tenant_id: a.ws, hostname: `${STUDIO_SLUG}.impronta.test`, kind: "custom", is_primary: false,
      status: "dns_verification_sent", verification_token: `impronta-verify-${fcId("domain:f3:custom").replace(/-/g, "").slice(0, 24)}`, tenant_slug: STUDIO_SLUG,
    }),
  );
  const roster = (wsId, tag) => [{ tag, tenantId: wsId, sourceType: "agency_created", visibility: "site_visible", directBooking: true, primary: true }];
  const people = [
    { key: "f3-a", code: "TAL-96010", display: LONG_TALENT_NAME, ws: a.ws, hours: true },
    { key: "f3-b", code: "TAL-96011", display: "Sofía Prueba", ws: a.ws, hours: true },
    { key: "f3-c", code: "TAL-96012", display: "Andrea Prueba Sin Horario", ws: b.ws, hours: false },
  ];
  const tids = {};
  for (const p of people) {
    const t = talentOps(fx, p.key, {
      code: p.code, display: p.display, tagline: "Limpieza a domicilio", workflow: "published", testAccount: false,
      agencyId: p.ws, bookingTerms: { directBookingOptIn: true }, hours: p.hours ? { tenantId: p.ws } : null,
      roster: roster(p.ws, "ws"),
    }, { trees, now });
    tids[p.key] = t.tid;
    ops.push(...t.ops);
  }
  const services = [
    { key: "f3-a-estandar", t: "f3-a", ws: a.ws, title: "Limpieza estándar", titleEn: "Standard cleaning", cents: 85000, min: 120, media: 0 },
    { key: "f3-a-profunda", t: "f3-a", ws: a.ws, title: "Limpieza profunda", titleEn: "Deep cleaning", cents: 150000, min: 240, media: 1 },
    { key: "f3-b-oficina", t: "f3-b", ws: a.ws, title: "Limpieza de oficina", titleEn: "Office cleaning", cents: 95000, min: 120, media: 2 },
    { key: "f3-c-estandar", t: "f3-c", ws: b.ws, title: "Limpieza estándar", titleEn: "Standard cleaning", cents: 85000, min: 120, media: 0 },
  ];
  for (const s of services) {
    ops.push(mediaOp(fx, s.key, { tenantId: s.ws, talentId: tids[s.t], n: s.media }));
    ops.push(...offeringOps(fx, s.key, {
      talentId: tids[s.t], tenantId: s.ws, title: s.title, titleEn: s.titleEn, description: "Servicio a domicilio con materiales incluidos.",
      amountCents: s.cents, duration: s.min, bookingMode: "instant", mediaKeys: [s.key],
    }).ops);
  }
  return { ops, studioId: a.ws, studio2Id: b.ws, ownerUser };
}

/** F5 (TUL-935, 941, 1051): six T1 promos scoped by talent_profile_id, one T2 promo (no bleed), a T1 promo page. */
export function planF5(now) {
  const fx = "F5";
  const base = (tid, user) => ({
    tenant_id: HUB_TENANT_ID, talent_profile_id: tid, kind: "percent", offer_kind: "percent", value: 20, currency: "MXN",
    tz: "America/Mexico_City", is_active: true, is_draft: false, is_paused: false, scope_kind: "all", applies_on: "appointment",
    audience: "public", unlock: "auto", show_on_site: true, show_countdown: false, created_by: user,
  });
  const t1 = (key, o) => insert(fx, "public.tenant_promo_codes", `promo:${key}`, { id: fcId(`promo:${key}`), ...base(G6.t1, G6.uT1), ...o });
  const ops = [
    t1("t1-public", { name: "20% de descuento", title_i18n: J({ es: "20% de descuento", en: "20% off" }) }),
    t1("t1-code", { name: "Codigo de descuento", unlock: "code", code: "QA20", show_on_site: false }),
    t1("t1-new-clients", { name: "Clientes nuevos", audience: "new_clients", value: 15 }),
    t1("t1-first3", { name: "Primeros 3", max_redemptions: 3, value: 25 }),
    t1("t1-countdown", { name: "Solo esta semana", show_countdown: true, ends_at: isoDays(now, 3), value: 10 }),
    t1("t1-expired", { name: "Promo vencida", starts_at: isoDays(now, -20), ends_at: isoDays(now, -2), value: 30 }),
    insert(fx, "public.tenant_promo_codes", "promo:t2-public", { id: fcId("promo:t2-public"), ...base(G6.t2, G6.uT2), value: 15, name: "15% electricidad" }),
  ];
  const blocks = [containerNode(fcId("node:f5:container"), [
    { id: `builder-promo-${fcId("node:f5:banner")}`, kind: "promo", props: { variant: "banner", audience: "everyone", pagesMode: "all", tone: "accent", dismissible: false } },
    { id: `builder-promo-${fcId("node:f5:cards")}`, kind: "promo", props: { variant: "cards", audience: "everyone", pagesMode: "all", maxCards: 3 } },
  ])];
  ops.push(insert(fx, "public.talent_pages", "page:f5:promos", {
    id: fcId("page:f5:promos"), talent_profile_id: G6.t1, slug: `${PREFIX}-promos`, title: "Promociones", status: "published",
    blocks: J(blocks), blocks_published: J(blocks), theme: J({}), is_home: false, sort_order: 50, nav_label: "Promos", published_at: now.toISOString(),
  }, ["talent_profile_id", "slug"]));
  return ops;
}

/** Copy-only draft (TUL-365): set ES/EN overlay copy on the first text node; base props untouched. */
export function makeCopyOnlyDraft(payload) {
  const draft = structuredClone(payload);
  const node = firstTextNode(draft.homeTree);
  if (!node) throw new Error("template payload has no text node");
  node.props.i18n = { ...(node.props.i18n ?? {}), es: { ...(node.props.i18n?.es ?? {}), text: "Bienvenida a mi espacio" }, en: { ...(node.props.i18n?.en ?? {}), text: "Welcome to my space" } };
  return draft;
}

/** One blocking publish issue (TUL-998): one unknown placeholder in one node's EN overlay copy. */
export function makeBlockingDraft(payload) {
  const draft = structuredClone(payload);
  const node = firstTextNode(draft.homeTree);
  if (!node) throw new Error("template payload has no text node");
  node.props.i18n = { ...(node.props.i18n ?? {}), en: { ...(node.props.i18n?.en ?? {}), text: "Hello {{qaNotAToken}}" } };
  return draft;
}

function firstTextNode(tree) {
  const stack = [...(Array.isArray(tree) ? tree : [])];
  while (stack.length) {
    const n = stack.shift();
    if (n && (n.kind === "paragraph" || n.kind === "heading") && typeof n.props?.text === "string") return n;
    if (Array.isArray(n?.children)) stack.unshift(...n.children);
  }
  return null;
}

/** F6 (TUL-365, 998): two non-demo QA designs released v1 to QA sites; one open draft each (one design = one open draft). */
export function planF6(now, { trees, templatePayload }) {
  const fx = "F6";
  const ops = [];
  const designs = [
    { tag: "copy", slug: `${PREFIX}-qa-copy`, title: "QA fixture copy-only design", draft: makeCopyOnlyDraft(templatePayload), code: "TAL-96013" },
    { tag: "block", slug: `${PREFIX}-qa-block`, title: "QA fixture blocking-issue design", draft: makeBlockingDraft(templatePayload), code: "TAL-96014" },
  ];
  for (const d of designs) {
    ops.push(
      insert(fx, "public.talent_theme_catalog", `design:f6-${d.tag}`, {
        id: fcId(`design:f6-${d.tag}`), kind: "design", slug: d.slug, title: d.title, summary: "Staging fixture design (failed-cards F6)",
        payload: J(templatePayload), preview: J({ names: { en: d.title, es: d.title } }), status: "published", source: "authored", version: 1,
        required_talent_tier: "talent_portfolio", sort_order: 900,
      }),
      insert(fx, "public.talent_theme_versions", `design_version:f6-${d.tag}`, { design: d.slug, version: 1, payload: J(templatePayload), source: "authored" }, ["design", "version"]),
      insert(fx, "public.talent_theme_releases", `release:f6-${d.tag}`, {
        id: fcId(`release:f6-${d.tag}`), design_slug: d.slug, from_version: 1, to_version: 1, channel: "optin", status: "published",
        notes: J({}), items: J([]), rollout_pct: 100, published_at: now.toISOString(),
      }),
      insert(fx, "public.talent_theme_drafts", `draft:f6-${d.tag}`, {
        id: fcId(`draft:f6-${d.tag}`), design: d.slug, base_version: 1, payload: J(d.draft), preview: J({}), status: "open", rev: 1,
      }),
    );
    ops.push(...talentOps(fx, `f6-${d.tag}`, {
      code: d.code, display: `qa-fixture Diseno ${d.tag}`, tagline: "Sitio de prueba para Builder Lab",
      site: { slug: `qa-${d.tag}`, extra: { theme_design_slug: d.slug, theme_design_version: 1 } },
    }, { trees, now }).ops);
  }
  return ops;
}

/** F10 (TUL-574): a T2 page with an area block, ES arrival note and the EN translation on the node. */
export function planF10(now) {
  const area = {
    id: fcId("node:f10:area"), kind: "visit",
    props: {
      layout: "area", eyebrow: "Zona", title: "Donde trabajo", arrivalNote: "Fuera de esta zona, el traslado se suma a la cotizacion.",
      i18n: { en: { eyebrow: "Area", title: "Where I work", arrivalNote: "Outside this area, travel is added to the quote." } },
    },
  };
  const blocks = [containerNode(fcId("node:f10:container"), [area])];
  return [insert("F10", "public.talent_pages", "page:f10:zona", {
    id: fcId("page:f10:zona"), talent_profile_id: G6.t2, slug: `${PREFIX}-zona`, title: "Zona de servicio", status: "published",
    blocks: J(blocks), blocks_published: J(blocks), theme: J({}), is_home: false, sort_order: 40, nav_label: "Zona", published_at: now.toISOString(),
  }, ["talent_profile_id", "slug"])];
}

/** F12 (TUL-802): a "Limpieza de casas" talent type + one publicly listed (non test-account) talent tagged to it. */
export function planF12(now, { trees, housekeepingTermId }) {
  const fx = "F12";
  const term = fcId("term:f12");
  return [
    insert(fx, "public.taxonomy_terms", "term:f12", {
      id: term, kind: "talent_type", term_type: "talent_type", slug: `${PREFIX}-limpieza-de-casas`, level: 3, parent_id: housekeepingTermId,
      name_i18n: J({ es: "Limpieza de casas", en: "House cleaning" }), is_active: true, is_public_filter: true, sort_order: 999,
    }),
    ...talentOps(fx, "f12", {
      code: "TAL-96015", display: "Carmen Prueba Limpieza de Casas", tagline: "Limpieza de casas en Cancun", workflow: "approved",
      testAccount: false, termId: term, site: { slug: "limpieza-casas" },
    }, { trees, now }).ops,
    { fx, kind: "call", table: "public.talent_discover_index", key: "refresh_talent_discover_index", sql: "select public.refresh_talent_discover_index()", applyOnly: true },
  ];
}

/** F14 workspace + talent: the only active member is a bot mailbox; the talent's site has the AI assistant on. */
export function planF14Base(now, { trees }) {
  const fx = "F14";
  const bot = userOps(fx, "f14-bot", { email: fcBotEmail("concierge"), name: "qa-fixture Concierge Bot", role: "agency_staff" });
  const w = workspaceOps(fx, "f14", { slug: CONCIERGE_SLUG, name: "qa-fixture Concierge", ownerUser: fcId("user:f14-bot"), at: now });
  const t = talentOps(fx, "f14", {
    code: "TAL-96016", display: "qa-fixture Concierge Talento", tagline: "Limpieza con asistente", user: { email: fcEmail("concierge-talent"), name: "qa-fixture Concierge Talento", role: "talent" },
    site: { slug: "concierge-talento", extra: { chat_enabled: true, chat_config: J({ aiBookingAssistantEnabled: true }) } },
    roster: [{ tag: "ws", tenantId: w.ws, visibility: "site_visible", primary: true }],
  }, { trees, now });
  return { ops: [...bot, ...w.ops, ...t.ops], conciergeWs: w.ws, talentId: t.tid, talentUser: t.userId };
}

/** S5 (TUL-837): a dedicated free-plan (talent_basic) talent with a login and a site, so TAL-00021 is not consumed. */
export function planS5(now, { trees }) {
  return talentOps("S5", "s5-free", {
    code: "TAL-96017", display: "qa-fixture Plan Gratis", tagline: "Talento en plan gratis", plan: "talent_basic",
    user: { email: fcEmail("free"), name: "qa-fixture Plan Gratis", role: "talent" }, site: { slug: "free" },
  }, { trees, now }).ops;
}

/** S6 DB half (TUL-1052, 1061): one payout talent per live payout country; `--stripe S6` adds the TEST Connect accounts. */
export const PAYOUT_COUNTRIES = [
  { iso: "MX", code: "TAL-96018", platform: "mx" },
  { iso: "US", code: "TAL-96019", platform: "us" },
  { iso: "CA", code: "TAL-96020", platform: "us" },
];
export function planS6(now, { trees }) {
  return PAYOUT_COUNTRIES.flatMap((c) => talentOps("S6", `s6-${c.iso.toLowerCase()}`, {
    code: c.code, display: `qa-fixture Pagos ${c.iso}`, tagline: `Cobros en ${c.iso}`, country: c.iso,
    user: { email: fcEmail(`payout-${c.iso.toLowerCase()}`), name: `qa-fixture Pagos ${c.iso}`, role: "talent" },
  }, { trees, now }).ops);
}

/**
 * F3 add-on (consultant localhost QA 2026-10-19): /t/site/qa-fixture-g6-quote shows only a name and bio.
 * Root cause on the data: every T1/T2 service title starts with "QA", and public loaders drop QA-named
 * services of test-account talents (src/lib/talent/qa-test-service.ts hideTestServiceOnPublicSite), and the
 * starter home tree has no services block. Adds a services page to T1 and T2 plus two non-QA-named T2
 * services (one public priced with a photo, one on_request without a price). T1 gets no new service:
 * TUL-841/896/933 need T1 to stay a single-service site.
 */
export function planF3Sites(now) {
  const fx = "F3";
  const ops = [
    ...offeringOps(fx, "f3-t2-lampara", {
      talentId: G6.t2, tenantId: HUB_TENANT_ID, title: "Instalación de lámpara", titleEn: "Light fixture installation",
      description: "Instalacion de una lampara de techo, material no incluido.", amountCents: 60000, duration: 60, bookingMode: "instant",
      category: "Electricidad", sort: 5,
    }).ops,
    ...offeringOps(fx, "f3-t2-revision", {
      talentId: G6.t2, tenantId: HUB_TENANT_ID, title: "Revisión de instalación eléctrica", titleEn: "Electrical inspection",
      description: "El precio se comparte al solicitar, segun la visita.", amountCents: null, duration: 90, bookingMode: "request",
      visibility: "on_request", category: "Electricidad", sort: 6,
    }).ops,
    // Photo for the priced one: the Group-6 stock photo 2 (already on T1's media; link only).
    insert(fx, "public.talent_offering_media", "offering_media:f3-t2-lampara:g6-media-2", { offering_id: fcId("offering:f3-t2-lampara"), media_asset_id: G6.media2, sort_order: 0 }, ["offering_id", "media_asset_id"]),
  ];
  for (const [who, tid] of [["t1", G6.t1], ["t2", G6.t2]]) {
    const blocks = [containerNode(fcId(`node:f3:${who}:container`), [{
      id: fcId(`node:f3:${who}:services`), kind: "services_catalog",
      props: { layout: "cards", title: "Servicios", showPrice: true, showDuration: true, showPhoto: true, showDescription: true },
    }])];
    ops.push(insert(fx, "public.talent_pages", `page:f3:${who}:servicios`, {
      id: fcId(`page:f3:${who}:servicios`), talent_profile_id: tid, slug: `${PREFIX}-servicios`, title: "Servicios", status: "published",
      blocks: J(blocks), blocks_published: J(blocks), theme: J({}), is_home: false, sort_order: 30, nav_label: "Servicios", published_at: now.toISOString(),
    }, ["talent_profile_id", "slug"]));
  }
  return ops;
}
