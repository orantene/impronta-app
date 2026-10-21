/**
 * T2: a second restaurant tenant for cross-tenant checks: its own dishes, its own QR tokens, its own promo code, its own staff.
 * Nothing here references a T1 row (tests pin it), so any leak between T1 and T2 is a real leak.
 */
import { email, insert, isoDays, linkOp, membershipOp, offeringOp, s2Id, userOps, visitToken, workspaceOps } from "./stage2-ops.mjs";

export const T2_SLUG = "s2-fonda";
export const T2_WS = s2Id("workspace:t2");
export const T2_STAFF = [
  { key: "t2-owner", name: "Elena Fonda", role: "owner" },
  { key: "t2-manager", name: "Raúl Esquina", role: "manager" },
];

export function planT2(at) {
  const fx = "T2";
  const ws = T2_WS;
  const w = workspaceOps(fx, "t2", {
    slug: T2_SLUG, name: "Fonda La Esquina", tagline: "Comida corrida y antojitos", businessType: "restaurant", ownerKey: "t2-owner", at, settings: { industry_preset: "restaurant" },
  });
  const ops = [];
  for (const u of T2_STAFF) ops.push(...userOps(fx, u.key, { email: email(u.key), name: u.name }));
  ops.push(...w.ops, membershipOp(fx, "t2-manager", ws, "t2-manager", { role: "manager" }, at));
  const venue = s2Id("venue:t2-main");
  ops.push(
    insert(fx, "public.venues", "venue:t2-main", { id: venue, tenant_id: ws, name: "Fonda La Esquina", slug: "s2-fonda-centro", city: "Mérida", country_code: "MX", timezone: "America/Merida", is_default: true, status: "active" }),
    insert(fx, "public.prep_stations", "station:t2-kitchen", { id: s2Id("station:t2-kitchen"), tenant_id: ws, code: "cocina", name: "Cocina", kind: "kitchen", sort_order: 0 }),
  );
  for (let n = 1; n <= 2; n += 1) {
    ops.push(
      insert(fx, "public.spaces", `space:t2-t${n}`, { id: s2Id(`space:t2-t${n}`), tenant_id: ws, venue_id: venue, kind: "table", name: `Mesa ${n}`, code: `T${n}`, party_min: 1, party_max: 4, seat_count: 4, status: "active", sort_order: n }),
      linkOp(fx, `t2-t${n}`, ws, { code: `s2-fonda-t${n}`, name: `Mesa ${n}`, kind: "table", to: "/menu", label: "Menú", spaceId: s2Id(`space:t2-t${n}`) }),
    );
  }
  ops.push(
    linkOp(fx, "t2-menu", ws, { code: "s2-fonda-menu", name: "Menú general", kind: "menu", to: "/menu", label: "Menú" }),
    insert(fx, "public.visits", "visit:t2-open", { id: s2Id("visit:t2-open"), tenant_id: ws, space_id: s2Id("space:t2-t1"), public_token: visitToken("t2-open"), status: "open", opened_at: at.toISOString(), opened_by: s2Id("user:t2-manager") }),
  );
  const dishes = [
    { key: "t2-pastor", title: "Tacos al pastor", en: "Pork tacos", cents: 7500, category: "Antojitos", sort: 10 },
    { key: "t2-sopa", title: "Sopa de tortilla", en: "Tortilla soup", cents: 6500, category: "Sopas", sort: 20 },
    { key: "t2-agua", title: "Agua fresca de horchata", en: "Horchata", cents: 3500, category: "Bebidas sin alcohol", sort: 30, attrs: { deal: true, alcohol: false } },
  ];
  for (const d of dishes) {
    ops.push(offeringOp(fx, d.key, ws, { title: d.title, titleEn: d.en, description: "Receta de la casa.", descriptionEn: "House recipe.", category: d.category, cents: d.cents, station: s2Id("station:t2-kitchen"), sort: d.sort, attrs: d.attrs }));
  }
  // Its own promo code (workspace-wide, 10%): T1 must never see or honour it.
  ops.push(insert(fx, "public.tenant_promo_codes", "promo:t2-fonda10", {
    id: s2Id("promo:t2-fonda10"), tenant_id: ws, code: "FONDA10", name: "Descuento de la fonda", kind: "percent", offer_kind: "percent", value: 10, per_customer_limit: 1,
    scope_kind: "all", audience: "public", unlock: "code", applies_on: "purchase", is_active: true, is_draft: false, is_paused: false, show_on_site: false,
    starts_at: isoDays(at, -1),
  }));
  return ops;
}
