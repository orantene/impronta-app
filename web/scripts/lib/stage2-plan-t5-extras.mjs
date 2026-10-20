/**
 * T5 story-10 extras (Experiencias Aurora). NON-ALCOHOLIC items only in every deal (PM rule O6).
 *   - drink deal: two non-alcoholic deal items + a "Clase + smoothie" package (components: the yoga class and the smoothie). The
 *     2x1 / happy-hour PROMO rules that point at these items arrive with the promos cluster (push 3).
 *   - tour: one departure, 12 seats, an early-bird price phase on the tier (price until +10 days, then the regular price).
 *   - beach club: a second venue, three beds with a minimum spend, an assigned tier group, one pool per bed, and the bed offering.
 */
import { addDays, ymdOf } from "./stage2-time.mjs";
import { insert, offeringOp, s2Id } from "./stage2-ops.mjs";
import { CANCUN, singleNight } from "./stage2-plan-events.mjs";

export const BED_MIN_SPEND_CENTS = 150000;
export const TOUR_EARLY_CENTS = 75000;
export const TOUR_REGULAR_CENTS = 90000;

export function planT5Extras(ws, at) {
  const fx = "T5";
  const today = ymdOf(at);
  const ops = [];

  // ---- drink deal (non-alcoholic only)
  const DEAL = { deal: true, alcohol: false, story: "2x1-happy-hour" };
  ops.push(
    offeringOp(fx, "smoothie", ws, { title: "Smoothie verde", titleEn: "Green smoothie", description: "Espinaca, piña y jengibre.", descriptionEn: "Spinach, pineapple and ginger.", category: "Bebidas sin alcohol", cents: 6500, sort: 20, attrs: DEAL }),
    offeringOp(fx, "agua-coco", ws, { title: "Agua de coco", titleEn: "Coconut water", description: "Agua de coco natural.", descriptionEn: "Fresh coconut water.", category: "Bebidas sin alcohol", cents: 5500, sort: 21, attrs: DEAL }),
    offeringOp(fx, "clase-smoothie", ws, { kind: "package", title: "Clase + smoothie", titleEn: "Class + smoothie", description: "Una clase de yoga y un smoothie.", descriptionEn: "A yoga class and a smoothie.", category: "Combos", cents: 29000, sort: 30, attrs: { deal: true, alcohol: false } }),
    insert(fx, "public.offering_components", "component:clase-smoothie-clase", { id: s2Id("component:clase-smoothie-clase"), tenant_id: ws, offering_id: s2Id("offering:clase-smoothie"), component_offering_id: s2Id("offering:clase-oferta"), qty: 1, required: true }),
    insert(fx, "public.offering_components", "component:clase-smoothie-bebida", { id: s2Id("component:clase-smoothie-bebida"), tenant_id: ws, offering_id: s2Id("offering:clase-smoothie"), component_offering_id: s2Id("offering:smoothie"), qty: 1, required: true }),
  );

  // ---- tour seats + early bird
  ops.push(
    ...singleNight(fx, "tour", ws, null, CANCUN, {
      title: "Tour de cenotes", titleEn: "Cenote tour", slug: "s2-experiencias-tour-cenotes", description: "Salida de ocho horas con guía y transporte.",
      descriptionEn: "Eight-hour departure with guide and transport.", date: addDays(today, 30), from: "08:00", to: "16:00", tier: "Adulto", cents: TOUR_REGULAR_CENTS, poolKey: "adulto", seats: 12, max: 6, at,
    }),
    insert(fx, "public.offering_price_phases", "phase:tour-early", {
      id: s2Id("phase:tour-early"), tenant_id: ws, offering_id: s2Id("offering:tour-event"), variant_id: s2Id("variant:tour-tier"), label: "Precio anticipado",
      starts_at: `${addDays(today, -1)}T00:00:00.000Z`, ends_at: `${addDays(today, 10)}T00:00:00.000Z`, price_cents: TOUR_EARLY_CENTS,
    }),
    insert(fx, "public.offering_price_phases", "phase:tour-regular", {
      id: s2Id("phase:tour-regular"), tenant_id: ws, offering_id: s2Id("offering:tour-event"), variant_id: s2Id("variant:tour-tier"), label: "Precio regular",
      starts_at: `${addDays(today, 10)}T00:00:00.000Z`, ends_at: null, price_cents: TOUR_REGULAR_CENTS,
    }),
  );

  // ---- beach-club bed + minimum spend
  const venue = s2Id("venue:t5-playa");
  const group = s2Id("group:t5-camas");
  ops.push(
    insert(fx, "public.venues", "venue:t5-playa", { id: venue, tenant_id: ws, name: "Beach Club Brisa", slug: "s2-experiencias-playa", city: "Cancún", country_code: "MX", timezone: CANCUN, is_default: false, status: "active" }),
    insert(fx, "public.space_groups", "group:t5-camas", { id: group, tenant_id: ws, venue_id: venue, name: "Camas VIP", kind: "tier", party_min: 1, party_max: 4, min_spend_cents: BED_MIN_SPEND_CENTS, sell_mode: "assigned", sort_order: 0 }),
    offeringOp(fx, "cama", ws, { kind: "service", title: "Cama de playa", titleEn: "Beach bed", description: "Cama para hasta cuatro personas con consumo mínimo.", descriptionEn: "A bed for up to four with a minimum spend.", category: "Club de playa", cents: BED_MIN_SPEND_CENTS, sort: 40 }),
  );
  for (let n = 1; n <= 3; n += 1) {
    const space = s2Id(`space:t5-cama${n}`);
    ops.push(
      insert(fx, "public.spaces", `space:t5-cama${n}`, { id: space, tenant_id: ws, venue_id: venue, kind: "bed", name: `Cama ${n}`, code: `B${n}`, party_min: 1, party_max: 4, seat_count: 4, min_spend_cents: BED_MIN_SPEND_CENTS, status: "active", sort_order: n }),
      insert(fx, "public.space_group_members", `member:t5-cama${n}`, { group_id: group, space_id: space, tenant_id: ws, sort_order: n }, ["group_id", "space_id"]),
      insert(fx, "public.capacity_pools", `pool:t5-cama${n}`, {
        id: s2Id(`pool:t5-cama${n}`), tenant_id: ws, subject_kind: "space", subject_id: space, pool_key: "default", units_total: 1, overbook_units: 0,
        hold_ttl_seconds: 900, unit_label: "bed", is_active: true, pool_path: [],
      }),
    );
  }
  return ops;
}
