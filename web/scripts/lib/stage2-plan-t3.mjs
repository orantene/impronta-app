/**
 * T3: agency tenant. A roster talent's PUBLIC service next to a venue table QR (the owner-leak check: the QR menu must show only
 * workspace-owned items, never the talent's service), an agency/venue manager, a talent-owner login, and additive rows for the hub
 * talent TAL-93900 (a package + a payout account). Nothing pre-existing is updated.
 */
import { email, insert, linkOp, membershipOp, offeringOp, s2Id, userOps, visitToken, workspaceOps } from "./stage2-ops.mjs";
import { talentOps, talentServiceOp } from "./stage2-ops-talent.mjs";

export const T3_SLUG = "s2-agencia";
export const T3_WS = s2Id("workspace:t3");
export const T3_TALENT_CODE = "TAL-96201";
export const HUB_TALENT_CODE = "TAL-93900";

export function planT3(at, hub) {
  const fx = "T3";
  const ws = T3_WS;
  const w = workspaceOps(fx, "t3", {
    slug: T3_SLUG, name: "Agencia Horizonte", tagline: "Talento y experiencias en Cancún", businessType: "talent-agency", plan: "agency", workspaceType: "talent",
    ownerKey: "t3-owner", at,
  });
  const ops = [
    ...userOps(fx, "t3-owner", { email: email("t3-owner"), name: "Mónica Reyes" }),
    ...userOps(fx, "t3-manager", { email: email("t3-manager"), name: "Andrés Lozano" }),
    ...userOps(fx, "t3-talent", { email: email("t3-talent"), name: "Valeria Costa", appRole: "talent" }),
    ...w.ops,
    membershipOp(fx, "t3-manager", ws, "t3-manager", { role: "manager" }, at),
  ];
  const t = talentOps(fx, "t3-valeria", { code: T3_TALENT_CODE, display: "Valeria Costa", tagline: "Fotografía de retrato y eventos", userKey: "t3-talent", ws, tz: "America/Cancun" }, at);
  ops.push(...t.ops);
  ops.push(talentServiceOp(fx, "t3-sesion", t.tid, ws, { title: "Sesión de fotos", titleEn: "Photo session", description: "Una hora de fotografía de retrato.", descriptionEn: "One hour of portrait photography.", cents: 80000, minutes: 60, category: "Fotografía" }));
  // The venue and its table QR. The workspace-owned menu item is the only thing the QR menu may show.
  const venue = s2Id("venue:t3-main");
  ops.push(
    insert(fx, "public.venues", "venue:t3-main", { id: venue, tenant_id: ws, name: "Café Horizonte", slug: "s2-agencia-cafe", city: "Cancún", country_code: "MX", timezone: "America/Cancun", is_default: true, status: "active" }),
    insert(fx, "public.spaces", "space:t3-t1", { id: s2Id("space:t3-t1"), tenant_id: ws, venue_id: venue, kind: "table", name: "Mesa 1", code: "T1", party_min: 1, party_max: 4, seat_count: 4, status: "active", sort_order: 1 }),
    linkOp(fx, "t3-t1", ws, { code: "s2-agencia-t1", name: "Mesa 1", kind: "table", to: "/menu", label: "Menú", spaceId: s2Id("space:t3-t1") }),
    linkOp(fx, "t3-menu", ws, { code: "s2-agencia-menu", name: "Menú general", kind: "menu", to: "/menu", label: "Menú" }),
    insert(fx, "public.visits", "visit:t3-open", { id: s2Id("visit:t3-open"), tenant_id: ws, space_id: s2Id("space:t3-t1"), public_token: visitToken("t3-open"), status: "open", opened_at: at.toISOString(), opened_by: s2Id("user:t3-manager") }),
    offeringOp(fx, "t3-cafe", ws, { title: "Café de la casa", titleEn: "House coffee", description: "Café de especialidad.", descriptionEn: "Specialty coffee.", category: "Bebidas sin alcohol", cents: 5000, sort: 10, attrs: { deal: true, alcohol: false } }),
  );
  return ops;
}

/**
 * The ADDITIVE rows next to the pre-existing hub talent TAL-93900: a package (new offering) and a payout account (new row, only when it has
 * no active one). `hub` = { talentId, tenantId, hasPayout } resolved read-only at run time. Every op carries touchesExisting so the guards
 * and the write list can single them out. No update of any existing row, ever.
 */
export function planHub(hub, at) {
  const fx = "T3";
  const ops = [
    talentServiceOp(fx, "t3-hub-paquete", hub.talentId, hub.tenantId, {
      kind: "package", title: "Paquete de sesión", titleEn: "Session package", description: "Tres sesiones con seguimiento.", descriptionEn: "Three sessions with follow-up.",
      cents: 150000, minutes: null, category: "Paquetes", bookingMode: "request", touchesExisting: HUB_TALENT_CODE,
    }),
  ];
  if (!hub.hasPayout) {
    const op = insert(fx, "public.payout_accounts", "payout:t3-hub", {
      id: s2Id("payout:t3-hub"), tenant_id: hub.tenantId, owner_type: "talent", owner_id: hub.talentId, display_name: "Cuenta de cobro de la fixture", provider: "manual_bank",
      status: "connected", connected_at: at.toISOString(),
    });
    op.touchesExisting = HUB_TALENT_CODE;
    ops.push(op);
  }
  return ops;
}
