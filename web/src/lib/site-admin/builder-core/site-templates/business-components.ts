/**
 * business-components.ts — Layer 2: the ONLY per-business-type layer.
 *
 * For each of the ~130 business types: which blocks its site needs and which
 * Look slot each lands in. A component reads brief facts through
 * `ComponentContext` and emits real registry nodes or its one honest empty
 * line. It never invents a dish, a price, an hour, a face or a review.
 *
 * Mapping: `FAMILY_COMPONENTS` gives every family its set; `TYPE_OVERRIDES`
 * adjusts individual types. `resolveComponentsForType` resolves any id in
 * `business-types.ts` (a static test proves all of them, plus `custom`).
 *
 * Root-only kinds (`location_map`, `directory`, `stats`) are emitted at root;
 * `instantiateSite` splices component output at the slot's root position, so
 * placement is always legal (D-TPL-10).
 */

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  BUSINESS_TYPES,
  type BusinessFamilyId,
} from "@/lib/words/business-types";

import { COMPONENT_EMPTY_STATES, COMPONENT_LABELS } from "./copy";
import { band, btn, card, ctas, eyebrow, grid, h, img, masonry, p, stack, tplId } from "./dsl";
import { resolveIdentityTemplate } from "./instantiate-site";
import type {
  Bilingual,
  BusinessComponent,
  ComponentContext,
  ComponentId,
  SiteLocale,
  SlotId,
} from "./types";

// ── Locale helpers ──────────────────────────────────────────────────────────

const other = (l: SiteLocale): SiteLocale => (l === "es" ? "en" : "es");

function label(key: string): Bilingual {
  const pair = COMPONENT_LABELS[key];
  if (!pair) throw new Error(`business-components: unknown label "${key}"`);
  return pair;
}

/** Text node props with the other locale riding on the i18n overlay. */
function bi(prop: "text" | "label" | "title" | "emptyMessage" | "headline" | "ctaVerb" | "venueName", pair: Bilingual, ctx: ComponentContext, vars: Record<string, string> = {}) {
  const fill = (s: string) => resolveIdentityTemplate(s.replace(/\{\{count\}\}/g, vars.count ?? ""), ctx.identity);
  return { [prop]: fill(pair[ctx.locale]), i18n: { [other(ctx.locale)]: { [prop]: fill(pair[other(ctx.locale)]) } } };
}

function line(pair: Bilingual, ctx: ComponentContext): BuilderNode {
  const node = p("");
  node.props = { ...node.props, ...bi("text", pair, ctx), style: { tone: "muted" } };
  return node;
}

function heading(level: 2 | 3, pair: Bilingual, ctx: ComponentContext): BuilderNode {
  const node = h(level, "");
  node.props = { ...node.props, ...bi("text", pair, ctx) };
  return node;
}

function button(pair: Bilingual, href: string, ctx: ComponentContext, tone: "primary" | "secondary" = "primary"): BuilderNode {
  const node = btn("", href, tone);
  node.props = { ...node.props, ...bi("label", pair, ctx) };
  return node;
}

function empty(id: ComponentId, ctx: ComponentContext, extra: BuilderNode[] = []): BuilderNode[] {
  const pair = COMPONENT_EMPTY_STATES[id];
  if (!pair || !pair.es) return [];
  return [band([line(pair, ctx), ...extra], { paddingY: "l", maxWidth: "reading" })];
}

function whatsappHref(ctx: ComponentContext): string | null {
  const digits = (ctx.identity.whatsapp ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

/** Contact-me fallback used by several empty states: WhatsApp when known, else the contact page. */
function askButton(ctx: ComponentContext): BuilderNode {
  const wa = whatsappHref(ctx);
  return wa
    ? button(label("askWhatsapp"), wa, ctx, "secondary")
    : button({ es: "Escríbenos", en: "Get in touch" }, "/contact", ctx, "secondary");
}

// ── Components ──────────────────────────────────────────────────────────────

const menuBoard: BusinessComponent = {
  id: "menu_board",
  slot: "catalogue",
  factKeys: ["menu.categories", "menu.items"],
  emptyState: COMPONENT_EMPTY_STATES.menu_board,
  build(ctx) {
    return [
      band(
        [
          {
            id: tplId("menu_board"),
            kind: "menu_board",
            props: {
              ...bi("title", label("menu"), ctx),
              // The block owns its empty state; keep it in the tenant's language.
              emptyMessage: COMPONENT_EMPTY_STATES.menu_board[ctx.locale],
              categoryNav: true,
              style: {},
            },
          },
        ],
        { paddingY: "l" },
      ),
    ];
  },
};

const reserveTable: BusinessComponent = {
  id: "reserve_table",
  slot: "transaction",
  factKeys: ["business.name", "operations.takes_bookings"],
  emptyState: COMPONENT_EMPTY_STATES.reserve_table,
  build(ctx) {
    return [
      band(
        [
          {
            id: tplId("reserve_table"),
            kind: "reserve_table",
            props: {
              venueName: ctx.identity.businessName,
              ...bi("ctaVerb", ctx.transactionLabel ?? label("reserve"), ctx),
              partyMin: 1,
              partyMax: 8,
              notesEnabled: true,
              style: {},
            },
          },
        ],
        { paddingY: "l", maxWidth: "reading" },
      ),
    ];
  },
};

const sessionPicker: BusinessComponent = {
  id: "session_picker",
  slot: "transaction",
  factKeys: ["operations.takes_bookings"],
  emptyState: COMPONENT_EMPTY_STATES.session_picker,
  build(ctx) {
    if (!ctx.offeringId) {
      return empty("session_picker", ctx, [ctas([button(label("goToBooking"), "/book", ctx), askButton(ctx)])]);
    }
    return [
      band(
        [{ id: tplId("session_picker"), kind: "session_picker", props: { offeringId: ctx.offeringId, ...bi("title", label("classes"), ctx), style: {} } }],
        { paddingY: "l" },
      ),
    ];
  },
};

const ticketPicker: BusinessComponent = {
  id: "ticket_picker",
  slot: "transaction",
  factKeys: [],
  emptyState: COMPONENT_EMPTY_STATES.ticket_picker,
  build(ctx) {
    if (!ctx.eventId) return empty("ticket_picker", ctx, [ctas([askButton(ctx)])]);
    return [
      band(
        [{ id: tplId("ticket_picker"), kind: "ticket_picker", props: { eventId: ctx.eventId, ...bi("title", label("tickets"), ctx), style: {} } }],
        { paddingY: "l" },
      ),
    ];
  },
};

const directory: BusinessComponent = {
  id: "directory",
  slot: "people",
  factKeys: ["business.represents_others"],
  emptyState: COMPONENT_EMPTY_STATES.directory,
  build(ctx) {
    if (!ctx.rosterActive) return empty("directory", ctx);
    return [
      {
        id: tplId("directory"),
        kind: "directory",
        props: {
          ...bi("headline", ctx.family === "agency" ? label("roster") : label("team"), ctx),
          entityLabel: ctx.family === "agency" ? "talent" : "team",
          scope: "all",
          pageSize: 12,
          columnsDesktop: 4,
          columnsMobile: 2,
          style: {},
        },
      },
    ];
  },
};

const team: BusinessComponent = {
  id: "team",
  slot: "people",
  factKeys: ["business.has_staff", "business.staff_count"],
  emptyState: COMPONENT_EMPTY_STATES.team,
  build(ctx) {
    if (!ctx.staffCount || ctx.staffCount < 1) return [];
    const count = String(ctx.staffCount);
    const size = p("");
    size.props = { ...size.props, ...bi("text", label("teamSize"), ctx, { count }) };
    return [
      band(
        [
          stack([eyebrowOf(label("team"), ctx), heading(2, label("team"), ctx), size], {}, { gap: "s" }),
          img("team", { aspectRatio: "4:3", radius: "md" }),
        ],
        { paddingY: "xl" },
      ),
    ];
  },
};

function eyebrowOf(pair: Bilingual, ctx: ComponentContext): BuilderNode {
  const node = eyebrow("");
  node.props = { ...node.props, ...bi("text", pair, ctx) };
  return node;
}

const serviceList: BusinessComponent = {
  id: "service_list",
  slot: "catalogue",
  factKeys: ["work.services"],
  emptyState: COMPONENT_EMPTY_STATES.service_list,
  build(ctx) {
    const services = (ctx.services ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (services.length === 0) return empty("service_list", ctx, [ctas([button(label("book"), "/book", ctx), askButton(ctx)])]);
    // Names only, in the owner's words. Prices and durations are not facts we hold.
    const cards = services.map((name) => card([h(3, name)], "outline"));
    return [band([grid(cards, services.length > 6 ? 3 : 2)], { paddingY: "l" })];
  },
};

const bookingForm: BusinessComponent = {
  id: "booking_form",
  slot: "transaction",
  factKeys: ["operations.takes_bookings", "operations.booking_method"],
  emptyState: COMPONENT_EMPTY_STATES.booking_form,
  build(ctx) {
    const f = (id: string, name: string, type: "text" | "tel" | "email" | "date" | "textarea" | "submit", key: string, required = false) => ({
      id,
      name,
      type,
      label: resolveIdentityTemplate(label(key)[ctx.locale], ctx.identity),
      required,
    });
    return [
      band(
        [
          heading(2, label(ctx.family === "dining" ? "order" : "book"), ctx),
          {
            id: tplId("form"),
            kind: "form",
            props: {
              method: "post",
              fields: [
                f("name", "name", "text", "fieldName", true),
                f("phone", "phone", "tel", "fieldPhone", true),
                f("email", "email", "email", "fieldEmail"),
                f("date", "preferred_date", "date", "fieldDate"),
                f("message", "message", "textarea", "fieldMessage"),
                f("submit", "submit", "submit", "bookSubmit"),
              ],
              style: {},
            },
          },
        ],
        { paddingY: "xl", maxWidth: "reading" },
      ),
    ];
  },
};

const locationHours: BusinessComponent = {
  id: "location_hours",
  slot: "map",
  factKeys: ["business.hours", "business.works_from"],
  emptyState: COMPONENT_EMPTY_STATES.location_hours,
  build(ctx) {
    const hours = (ctx.identity.hours ?? []).map((l) => l.trim()).filter(Boolean);
    const city = ctx.identity.city?.trim();
    const items = city ? [{ label: city, featured: true }] : [];
    const overlayHours = hours.length > 0 ? hours.join(" · ").slice(0, 280) : undefined;
    const hoursNodes: BuilderNode[] =
      hours.length > 0
        ? [band([heading(3, label("hours"), ctx), ...hours.map((l) => p(l))], { paddingY: "l", maxWidth: "reading", gap: "s" })]
        : empty("location_hours", ctx);
    // No city and no address → no map at all (its empty state speaks of a
    // roster, which this business is not); the hours band still renders.
    if (items.length === 0 && !ctx.identity.address?.trim()) return hoursNodes;
    const map: BuilderNode = {
      id: tplId("location_map"),
      kind: "location_map",
      props: {
        ...bi("headline", label("whereWeAre"), ctx),
        source: "manual",
        items,
        showMap: items.length > 0,
        mapStyle: "editorial",
        overlayTitle: ctx.identity.businessName,
        overlayAddress: ctx.identity.address?.trim() || undefined,
        overlayHours,
        overlaySide: "card-right",
        ratio: "16/9",
        layout: "list",
        emptyStateText: COMPONENT_EMPTY_STATES.location_hours[ctx.locale],
        style: {},
      },
    };
    return [map, ...hoursNodes];
  },
};

const whatsappOrder: BusinessComponent = {
  id: "whatsapp_order",
  slot: "whatsapp",
  factKeys: ["presence.whatsapp"],
  emptyState: COMPONENT_EMPTY_STATES.whatsapp_order,
  build(ctx) {
    const wa = whatsappHref(ctx);
    if (!wa) return []; // no number → no button; a dead CTA is worse than none
    const pair = ctx.family === "dining" ? label("orderWhatsapp") : label("askWhatsapp");
    return [band([ctas([button(pair, wa, ctx)], "center")], { paddingY: "l", align: "center" })];
  },
};

const gallery: BusinessComponent = {
  id: "gallery",
  slot: "gallery",
  factKeys: [],
  emptyState: COMPONENT_EMPTY_STATES.gallery,
  build() {
    // Six frames from the resolver (owner photos first, stock second).
    // `instantiateSite` drops any frame that has no honest image.
    return [
      band(
        [
          masonry(
            [
              img("gallery-1", { aspectRatio: "4:3" }),
              img("gallery-2", { aspectRatio: "3:4" }),
              img("gallery-3", { aspectRatio: "1:1" }),
              img("wide", { aspectRatio: "16:9" }),
              img("gallery-4", { aspectRatio: "4:3" }),
              img("detail", { aspectRatio: "1:1" }),
            ],
            3,
          ),
        ],
        { paddingY: "l", maxWidth: "wide" },
      ),
    ];
  },
};

const proof: BusinessComponent = {
  id: "proof",
  slot: "home.proof",
  factKeys: ["work.years_experience", "business.staff_count"],
  emptyState: COMPONENT_EMPTY_STATES.proof,
  build(ctx) {
    const items: Array<{ value: string; label: string }> = [];
    if (ctx.yearsExperience && ctx.yearsExperience > 0) {
      items.push({ value: String(ctx.yearsExperience), label: label("yearsLabel")[ctx.locale] });
    }
    if (items.length === 0) return []; // no fact, no band
    return [
      {
        id: tplId("stats"),
        kind: "stats",
        props: { items, variant: "row", align: "center", style: {} },
      },
    ];
  },
};

export const BUSINESS_COMPONENTS: Readonly<Record<ComponentId, BusinessComponent>> = {
  menu_board: menuBoard,
  reserve_table: reserveTable,
  session_picker: sessionPicker,
  ticket_picker: ticketPicker,
  directory,
  team,
  service_list: serviceList,
  booking_form: bookingForm,
  location_hours: locationHours,
  whatsapp_order: whatsappOrder,
  gallery,
  proof,
};

// ── Mapping ─────────────────────────────────────────────────────────────────

const EVERYONE: readonly ComponentId[] = ["location_hours", "whatsapp_order", "gallery", "proof"];

export const FAMILY_COMPONENTS: Readonly<Record<BusinessFamilyId, readonly ComponentId[]>> = {
  dining: ["menu_board", "reserve_table", "team", ...EVERYONE],
  beauty: ["service_list", "booking_form", "team", ...EVERYONE],
  wellness: ["service_list", "booking_form", "team", ...EVERYONE],
  fitness: ["service_list", "session_picker", "team", ...EVERYONE],
  events: ["service_list", "ticket_picker", "reserve_table", ...EVERYONE],
  agency: ["service_list", "directory", "booking_form", ...EVERYONE],
  professional: ["service_list", "booking_form", "team", ...EVERYONE],
  education: ["service_list", "session_picker", "team", ...EVERYONE],
  hospitality: ["service_list", "reserve_table", "team", ...EVERYONE],
  craft: ["service_list", "booking_form", ...EVERYONE],
  tours: ["service_list", "booking_form", "team", ...EVERYONE],
  custom: ["service_list", "booking_form", ...EVERYONE],
};

/** Per-type adjustments. Ids must exist in `business-types.ts`. */
export const TYPE_OVERRIDES: Readonly<Record<string, { add?: readonly ComponentId[]; remove?: readonly ComponentId[] }>> = {
  // Dining without a room: order, don't reserve.
  "home-takeaway": { remove: ["reserve_table"], add: ["booking_form"] },
  "food-truck": { remove: ["reserve_table"], add: ["booking_form"] },
  "bakery-cafe": { remove: ["reserve_table"], add: ["booking_form"] },
  "dessert-shop": { remove: ["reserve_table"], add: ["booking_form"] },
  "ice-cream-shop": { remove: ["reserve_table"], add: ["booking_form"] },
  "catering-company": { remove: ["reserve_table"], add: ["booking_form"] },
  "private-chef": { add: ["menu_board"] },
  // Events that sell dates, not tables.
  "art-gallery": { remove: ["reserve_table"], add: ["booking_form"] },
  "escape-room": { remove: ["ticket_picker"], add: ["booking_form"] },
  "live-music-venue": { add: ["menu_board"] },
  "nightclub": { add: ["menu_board"] },
  "karaoke-venue": { add: ["menu_board"] },
  "cocktail-lounge": { add: ["menu_board"] },
  "rooftop-lounge": { add: ["menu_board"] },
  "wine-tasting-room": { add: ["menu_board"] },
  "brewery-taproom": { add: ["menu_board"] },
  "pool-club": { add: ["menu_board"] },
  // Solo practitioners: no team band.
  "massage-therapist": { remove: ["team"] },
  "makeup-artist": { remove: ["team"] },
  "personal-trainer": { remove: ["team"] },
  "yoga-instructor": { remove: ["team"] },
  "language-tutor": { remove: ["team"] },
  "translator": { remove: ["team"] },
  "voice-over": { remove: ["team"] },
  "house-cleaner": { remove: ["team"] },
  "handyman": { remove: ["team"] },
  "dog-walker": { remove: ["team"] },
  "car-detailing": { remove: ["team"] },
  "independent-dj": { remove: ["team"] },
  "independent-musician": { remove: ["team"] },
  "event-host": { remove: ["team"] },
  "portrait-photographer": { remove: ["team"] },
  "career-coach": { remove: ["team"] },
  "life-coach": { remove: ["team"] },
  "interpreter": { remove: ["team"] },
  "personal-stylist": { remove: ["team"] },
  // Places people gather that also host sessions.
  "coworking": { add: ["session_picker"] },
  "padel-club": { add: ["reserve_table"] },
  "sports-court-rental": { add: ["reserve_table"] },
  "beach-club": { add: ["menu_board"] },
  "wellness-retreat": { remove: ["booking_form"], add: ["session_picker"] },
};

const TYPE_FAMILY = new Map(BUSINESS_TYPES.map((t) => [t.id, t.family] as const));

export function familyForType(typeId: string): BusinessFamilyId {
  return TYPE_FAMILY.get(typeId) ?? "custom";
}

/** Ordered, de-duplicated component ids for a business type. */
export function resolveComponentsForType(typeId: string): ComponentId[] {
  const family = familyForType(typeId);
  const base = [...FAMILY_COMPONENTS[family]];
  const override = TYPE_OVERRIDES[typeId];
  const removed = new Set(override?.remove ?? []);
  const out = base.filter((id) => !removed.has(id));
  for (const id of override?.add ?? []) if (!out.includes(id)) out.push(id);
  return out;
}

/** Build every component for a type into a slot → nodes map. When two
 *  components claim one slot, the first in registry order wins the slot and
 *  the rest append after it (a menu board then a reserve band, for example). */
export function buildComponentsForType(typeId: string, ctx: ComponentContext): Map<SlotId, BuilderNode[]> {
  const out = new Map<SlotId, BuilderNode[]>();
  for (const id of resolveComponentsForType(typeId)) {
    const component = BUSINESS_COMPONENTS[id];
    const nodes = component.build(ctx);
    if (nodes.length === 0) continue;
    out.set(component.slot, [...(out.get(component.slot) ?? []), ...nodes]);
  }
  return out;
}
