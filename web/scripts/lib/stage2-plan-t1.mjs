/**
 * T1: MX restaurant / bar. MXN, ES + EN, venue A America/Cancun, venue B UTC (the column default, left unset on purpose),
 * venue C America/New_York (DST copy). Floor, QR, devices, shift, reservation rules and staff. Catalog: stage2-plan-t1-catalog.mjs.
 */
import { email, insert, isoDays, J, linkOp, membershipOp, offeringOp, s2Id, userOps, visitToken, workspaceOps } from "./stage2-ops.mjs";

export const T1_SLUG = "s2-cantina";
export const T1_KEY = "t1";
export const T1_WS = s2Id("workspace:t1");

/** Staff of T1. role = the real tenant role; the label says what the person does (the app has viewer..owner only). */
export const T1_STAFF = [
  { key: "t1-owner", name: "Rosa Mendoza", role: "owner" },
  { key: "t1-admin", name: "Luis Herrera", role: "admin" },
  { key: "t1-manager", name: "Carmen Vidal", role: "manager", pin: true },
  { key: "t1-editor", name: "Paola Ríos", role: "editor" },
  { key: "t1-viewer", name: "Jorge Salas", role: "viewer" },
  // The app has no cashier role: an editor holds neither booking.payment.refund nor manage_billing.
  { key: "t1-cashier", name: "Diego Cajero", role: "editor" },
  { key: "t1-kitchen", name: "Tablero Cocina Barra", role: "viewer" },
  { key: "t1-door", name: "Ana Puerta", role: "editor" },
  { key: "t1-host", name: "Marta Anfitriona", role: "editor" },
  { key: "t1-pending", name: "Iván Invitado", role: "editor", status: "invited", confirmed: false },
  { key: "t1-suspended", name: "Sofía Suspendida", role: "editor", status: "suspended" },
];

/** role_limits rows: some set, the rest (viewer, admin, owner; manager discount) deliberately unset. */
export const T1_ROLE_LIMITS = [
  { role: "editor", action: "discount", cents: 5000 },
  { role: "editor", action: "refund", cents: 0 },
  { role: "manager", action: "refund", cents: 50000 },
];

export const VENUES = [
  { tag: "a", name: "Sucursal Centro", slug: "s2-cantina-centro", tz: "America/Cancun", country: "MX", city: "Cancún", isDefault: true },
  { tag: "b", name: "Sucursal Playa", slug: "s2-cantina-playa", tz: null, country: "MX", city: "Playa del Carmen" }, // timezone left at the UTC default
  { tag: "c", name: "Sucursal Nueva York", slug: "s2-cantina-nyc", tz: "America/New_York", country: "US", city: "New York" },
];

export function planT1Core(at) {
  const fx = "T1";
  const ws = workspaceOps(fx, T1_KEY, {
    slug: T1_SLUG, name: "La Cantina del Puerto", tagline: "Cocina mexicana y bar en Cancún", businessType: "restaurant", ownerKey: "t1-owner", at,
    settings: { industry_preset: "restaurant" },
  });
  const ops = [];
  for (const u of T1_STAFF) ops.push(...userOps(fx, u.key, { email: email(u.key), name: u.name, confirmed: u.confirmed ?? true }));
  ops.push(...ws.ops);
  for (const u of T1_STAFF) {
    if (u.role === "owner") continue;
    ops.push(membershipOp(fx, u.key, ws.ws, u.key, { role: u.role, status: u.status ?? "active" }, at));
  }
  for (const r of T1_ROLE_LIMITS) {
    ops.push(insert(fx, "public.role_limits", `rolelimit:t1-${r.role}-${r.action}`, { id: s2Id(`rolelimit:t1-${r.role}-${r.action}`), tenant_id: ws.ws, role: r.role, action: r.action, limit_cents: r.cents }));
  }
  // The manager's PIN: a bcrypt hash under agencies.settings.people.pins (this seed's own workspace row). The PIN comes from the local seed config.
  ops.push({ fx, kind: "pin", table: "public.agencies", key: "pin:t1-manager", id: ws.ws, userId: s2Id("user:t1-manager"), secretKey: "t1-manager" });
  return ops;
}

/** Venues A/B/C, the reservation rules on A (deposit from party 6, MXN 100 pp, no-show fee, 24 h free cancel), tables, bar, stations, QR. */
export function planT1Floor(at) {
  const fx = "T1";
  const ws = T1_WS;
  const ops = [];
  for (const v of VENUES) {
    ops.push(insert(fx, "public.venues", `venue:t1-${v.tag}`, {
      id: s2Id(`venue:t1-${v.tag}`), tenant_id: ws, name: v.name, slug: v.slug, city: v.city, country_code: v.country,
      ...(v.tz ? { timezone: v.tz } : {}), is_default: Boolean(v.isDefault), status: "active",
    }));
  }
  const venueA = s2Id("venue:t1-a");
  ops.push(
    // The reservation offering BEFORE the rules row that points at it (venue_service_rules.reservation_offering_id is a non-deferrable FK).
    offeringOp(fx, "t1-reserva", ws, {
      kind: "service", title: "Reservación de mesa", titleEn: "Table reservation", description: "Mesa para cenar en el restaurante.", descriptionEn: "A table for dinner at the restaurant.",
      category: "Reservaciones", cents: 10000, sort: 100, extra: { reserve_mode: "full", allow_pay_in_person: true, cancellation_hours: 24 },
    }),
    insert(fx, "public.venue_service_rules", "rules:t1-a", {
      venue_id: venueA, tenant_id: ws, is_active: true, party_size_min: 1, party_size_max: 8, horizon_days: 60, min_notice_minutes: 60,
      default_turn_minutes: 90, allow_public_upsize: false, card_on_file_from_party: 6, no_show_fee_cents: 20000, no_show_fee_basis: "per_person",
      deposit_from_party: 6, deposit_cents_per_person: 10000, free_cancel_hours: 24, walkins_enabled: true, notes_enabled: true,
      reservation_offering_id: s2Id("offering:t1-reserva"),
    }, ["venue_id"]),
    insert(fx, "public.venue_service_windows", "window:t1-a-cena", {
      id: s2Id("window:t1-a-cena"), tenant_id: ws, venue_id: venueA, key: "cena", label: J({ es: "Cena", en: "Dinner" }), local_time: "19:00",
      duration_minutes: 240, weekdays: [1, 2, 3, 4, 5, 6, 7], seating_step_minutes: 30, is_active: true, sort_order: 0,
    }),
  );
  for (const b of [{ tag: "chica", name: "Mesas de 1 a 4", min: 1, max: 4, units: 3, sort: 0 }, { tag: "grande", name: "Mesas de 5 a 8", min: 5, max: 8, units: 2, sort: 1 }]) {
    const gid = s2Id(`group:t1-${b.tag}`);
    ops.push(
      insert(fx, "public.space_groups", `group:t1-${b.tag}`, { id: gid, tenant_id: ws, venue_id: venueA, name: b.name, kind: "party_band", party_min: b.min, party_max: b.max, sell_mode: "band", sort_order: b.sort }),
      insert(fx, "public.capacity_pools", `pool:t1-${b.tag}`, {
        id: s2Id(`pool:t1-${b.tag}`), tenant_id: ws, subject_kind: "space_group", subject_id: gid, pool_key: "default", units_total: b.units, overbook_units: 0,
        hold_ttl_seconds: 900, unit_label: "table", is_active: true, pool_path: [],
      }),
    );
  }
  // Tables T1-T4 and a bar area on venue A.
  for (let n = 1; n <= 4; n += 1) {
    ops.push(insert(fx, "public.spaces", `space:t1-t${n}`, {
      id: s2Id(`space:t1-t${n}`), tenant_id: ws, venue_id: venueA, kind: "table", name: `Mesa ${n}`, code: `T${n}`, party_min: 1, party_max: 4, seat_count: 4, status: "active", sort_order: n,
    }));
  }
  ops.push(insert(fx, "public.spaces", "space:t1-bar", { id: s2Id("space:t1-bar"), tenant_id: ws, venue_id: venueA, kind: "area", name: "Barra", code: "BAR", party_min: 1, party_max: 12, seat_count: 12, status: "active", sort_order: 9 }));
  // Stations.
  ops.push(
    insert(fx, "public.prep_stations", "station:t1-kitchen", { id: s2Id("station:t1-kitchen"), tenant_id: ws, code: "cocina", name: "Cocina", kind: "kitchen", sort_order: 0 }),
    insert(fx, "public.prep_stations", "station:t1-bar", { id: s2Id("station:t1-bar"), tenant_id: ws, code: "barra", name: "Barra", kind: "bar", sort_order: 1 }),
  );
  // QR: a readable table code per table, one generic menu code; one open visit (Mesa 1) and one closed visit (Mesa 2).
  for (let n = 1; n <= 4; n += 1) {
    ops.push(linkOp(fx, `t1-t${n}`, ws, { code: `s2-cantina-t${n}`, name: `Mesa ${n}`, kind: "table", to: "/menu", label: "Menú", spaceId: s2Id(`space:t1-t${n}`) }));
  }
  ops.push(linkOp(fx, "t1-menu", ws, { code: "s2-cantina-menu", name: "Menú general", kind: "menu", to: "/menu", label: "Menú" }));
  ops.push(
    insert(fx, "public.visits", "visit:t1-open", { id: s2Id("visit:t1-open"), tenant_id: ws, space_id: s2Id("space:t1-t1"), public_token: visitToken("t1-open"), status: "open", opened_at: at.toISOString(), opened_by: s2Id("user:t1-host") }),
    insert(fx, "public.visits", "visit:t1-closed", {
      id: s2Id("visit:t1-closed"), tenant_id: ws, space_id: s2Id("space:t1-t2"), public_token: visitToken("t1-closed"), status: "closed",
      opened_at: isoDays(at, -1), closed_at: new Date(at.getTime() - 20 * 3600000).toISOString(), opened_by: s2Id("user:t1-host"),
    }),
  );
  return ops;
}

/** Devices (2 POS tablets, 1 kitchen board display, 2 door phones) and an open MXN 500 cash shift. */
export function planT1Devices(at) {
  const fx = "T1";
  const ws = T1_WS;
  const devs = [
    { tag: "pos-1", name: "Caja 1", kind: "tablet", mode: "pos" },
    { tag: "pos-2", name: "Caja 2", kind: "tablet", mode: "pos" },
    { tag: "kitchen-1", name: "Tablero de cocina", kind: "display", mode: "kitchen" },
    { tag: "door-1", name: "Puerta 1", kind: "phone", mode: "door" },
    { tag: "door-2", name: "Puerta 2", kind: "phone", mode: "door" },
  ];
  const ops = devs.map((d) => insert(fx, "public.pos_devices", `device:t1-${d.tag}`, {
    id: s2Id(`device:t1-${d.tag}`), tenant_id: ws, device_key: `s2dev-t1-${d.tag}`, name: d.name, kind: d.kind, status: "active", settings: J({ mode: d.mode }), registered_by: s2Id("user:t1-owner"),
  }));
  ops.push(insert(fx, "public.pos_shifts", "shift:t1-open", {
    id: s2Id("shift:t1-open"), tenant_id: ws, status: "open", opened_by: s2Id("user:t1-cashier"), opened_at: at.toISOString(), opening_cash_cents: 50000,
  }));
  return ops;
}
