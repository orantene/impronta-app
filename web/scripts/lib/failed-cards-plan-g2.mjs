/**
 * Pure planners for G6-G8 (QA Conductor ask, 2026-10-20), all on the F3 studio workspace `qa-fixture-g6-studio`.
 * Same rules as failed-cards-plan-g.mjs: additive, ids `fcId(key)`, slugs `qa-fixture-g6-*`, copy never says QA/test/E2E.
 * No order, admission or payment is pre-made: testers buy live in Stripe TEST.
 *
 *   G6  tiered event, 2 nights, 2 public tiers + 1 hidden comp tier     #4198 hidden tiers, #4201 per-unit refund/exchange
 *   G7  reservable venue, MXN 100/person deposit from a party of 6      #4200 table deposit
 *   G8  prepaid instant-book service with a 48 h free-cancel window     #4199 refund on cancel
 */
import { PREFIX } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import { J, insert, isoDays, offeringOps } from "./failed-cards-ops.mjs";
import { menuItem } from "./failed-cards-plan-g.mjs";

export const G6_EVENT_SLUG = `${PREFIX}-festival-verano`;
/** Hidden comp / guest-list tier: its key is not a word a guest could guess into a link. */
export const G6_HIDDEN_KEY = "inv_k7m2x9q4";
export const G6_MAX_PER_ORDER = 4;
/** Public tiers first, then the hidden one. `seats` = units per night per tier. */
export const G6_TIERS = [
  { tag: "general", key: "general", label: "General", cents: 30000, seats: 8, hidden: false },
  { tag: "preferente", key: "preferente", label: "Preferente", cents: 55000, seats: 6, hidden: false },
  { tag: "invitados", key: G6_HIDDEN_KEY, label: "Lista de invitados", cents: 0, seats: 4, hidden: true },
];

/** G6: published tiered event, 2 nights, 2 public tiers (cheaper General, dearer Preferente) + 1 hidden tier. */
export function planG6(now, ws) {
  const fx = "G6";
  const title = "Festival de Verano Brillo";
  const offeringId = fcId("offering:g6-event");
  const eventId = fcId("event:g6");
  const nights = [{ tag: "n1", days: 35 }, { tag: "n2", days: 36 }].map((n) => {
    const startsAt = isoDays(now, n.days);
    return { ...n, id: fcId(`session:g6-${n.tag}`), startsAt, endsAt: new Date(new Date(startsAt).getTime() + 4 * 3600000).toISOString() };
  });
  const ops = [
    insert(fx, "public.talent_offerings", "offering:g6-event", {
      id: offeringId, tenant_id: ws, owner_kind: "workspace", talent_profile_id: null, kind: "package", title,
      description: "Dos noches de música en vivo.", currency: "MXN", amount_cents: 30000, price_type: "flat_package", price_display: "exact",
      booking_mode: "request", status: "published", moderation_state: "approved", visibility: "public", category: "Eventos",
      title_i18n: J({ es: title, en: "Summer Festival at Brillo" }), attributes: J({}),
    }),
    insert(fx, "public.events", "event:g6", {
      id: eventId, tenant_id: ws, slug: G6_EVENT_SLUG, title, description: "Dos noches de música en vivo. Elige tu entrada.",
      status: "published", published_at: now.toISOString(), offering_id: offeringId, admission_kind: "ticket", doors_offset_minutes: 30,
      refunds_open: true, refund_policy_key: "manual",
    }),
  ];
  for (const n of nights) {
    ops.push(insert(fx, "public.sessions", `session:g6-${n.tag}`, {
      id: n.id, tenant_id: ws, event_id: eventId, offering_id: offeringId, starts_at: n.startsAt, ends_at: n.endsAt, status: "scheduled",
    }));
  }
  G6_TIERS.forEach((t, i) => {
    ops.push(insert(fx, "public.talent_offering_variants", `variant:g6-${t.tag}`, {
      id: fcId(`variant:g6-${t.tag}`), offering_id: offeringId, label: t.label, amount_cents: t.cents, sort_order: i,
      pool_key: t.key, min_per_order: 1, max_per_order: G6_MAX_PER_ORDER, is_hidden: t.hidden,
    }));
  });
  for (const n of nights) {
    for (const t of G6_TIERS) {
      ops.push(insert(fx, "public.capacity_pools", `pool:g6-${n.tag}-${t.tag}`, {
        id: fcId(`pool:g6-${n.tag}-${t.tag}`), tenant_id: ws, subject_kind: "session_tier", subject_id: n.id, pool_key: t.key,
        units_total: t.seats, overbook_units: 0, hold_ttl_seconds: 900, unit_label: "seat", is_active: true, pool_path: [],
      }));
    }
  }
  return ops;
}

export const G7_DEPOSIT_CENTS_PER_PERSON = 10000;
export const G7_DEPOSIT_FROM_PARTY = 6;
export const G7_DISPLAY_CURRENCY = "MXN";

/** G7: a reservable venue with a MXN 100 per person deposit from a party of 6, and the workspace display currency MXN. */
export function planG7(ws) {
  const fx = "G7";
  const venueId = fcId("venue:g7");
  const offeringId = fcId("offering:g7-mesa");
  const bands = [
    { tag: "chica", name: "Mesas de 1 a 4", min: 1, max: 4, tables: 3, sort: 0 },
    { tag: "grande", name: "Mesas de 5 a 8", min: 5, max: 8, tables: 2, sort: 1 },
  ];
  const ops = [
    // Additive: only settings.display_currency. The runner merges it into the live blob and backs the row up first.
    { fx, kind: "update", table: "public.agencies", key: "settings:g7-display-currency", id: ws, merge: { settings: { display_currency: G7_DISPLAY_CURRENCY } } },
    insert(fx, "public.venues", "venue:g7", {
      id: venueId, tenant_id: ws, name: "Salón Brillo", slug: `${PREFIX}-salon-brillo`, city: "Cancún", country_code: "MX",
      timezone: "America/Cancun", is_default: true, status: "active",
    }),
    menuItem(fx, "g7-mesa", ws, {
      kind: "service", title: "Reservación de mesa", titleEn: "Table reservation", description: "Mesa para cenar en el salón.",
      descriptionEn: "A table for dinner in the dining room.", category: "Reservaciones", amountCents: 10000, sort: 30,
      extra: { reserve_mode: "full", allow_pay_in_person: true, cancellation_hours: 2 },
    }),
    // venue_service_rules has no id column (PK = venue_id); it goes away with its venue.
    insert(fx, "public.venue_service_rules", "rules:g7", {
      venue_id: venueId, tenant_id: ws, is_active: true, party_size_min: 1, party_size_max: 8, horizon_days: 60, min_notice_minutes: 60,
      default_turn_minutes: 90, allow_public_upsize: false, deposit_from_party: G7_DEPOSIT_FROM_PARTY,
      deposit_cents_per_person: G7_DEPOSIT_CENTS_PER_PERSON, free_cancel_hours: 2, walkins_enabled: true, notes_enabled: true,
      reservation_offering_id: offeringId,
    }, ["venue_id"]),
    insert(fx, "public.venue_service_windows", "window:g7-cena", {
      id: fcId("window:g7-cena"), tenant_id: ws, venue_id: venueId, key: "cena", label: J({ es: "Cena", en: "Dinner" }),
      local_time: "19:00", duration_minutes: 180, weekdays: [1, 2, 3, 4, 5, 6, 7], seating_step_minutes: 30, is_active: true, sort_order: 0,
    }),
  ];
  for (const b of bands) {
    const groupId = fcId(`group:g7-${b.tag}`);
    ops.push(
      insert(fx, "public.space_groups", `group:g7-${b.tag}`, {
        id: groupId, tenant_id: ws, venue_id: venueId, name: b.name, kind: "party_band", party_min: b.min, party_max: b.max, sell_mode: "band", sort_order: b.sort,
      }),
      insert(fx, "public.capacity_pools", `pool:g7-${b.tag}`, {
        id: fcId(`pool:g7-${b.tag}`), tenant_id: ws, subject_kind: "space_group", subject_id: groupId, pool_key: "default",
        units_total: b.tables, overbook_units: 0, hold_ttl_seconds: 900, unit_label: "table", is_active: true, pool_path: [],
      }),
    );
  }
  return ops;
}

export const G8_CANCEL_FREE_HOURS = 48;

/** G8: an instant-book prepaid service with a 48 h free-cancel window (offering.cancellation_hours, first link of the cancel-policy chain). */
export function planG8(ws) {
  return offeringOps("G8", "g8-expres", {
    talentId: fcId("talent:f3-b"), // Sofía, the F3 roster talent with Mon-Sat hours
    tenantId: ws, title: "Limpieza exprés", titleEn: "Express cleaning", description: "Servicio a domicilio con materiales incluidos.",
    amountCents: 60000, duration: 60, bookingMode: "instant", mediaKeys: ["f3-b-oficina"], cancellationHours: G8_CANCEL_FREE_HOURS, sort: 5,
  }).ops;
}
