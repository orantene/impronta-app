/**
 * Promos on the ONE promo engine (tenant_promo_codes, Promos v1). Weekdays: 0 = Sunday (lib/promos/quote.ts). Money in cents.
 * Rules of the card, and what the schema can and cannot say today:
 *   - every 2x1 / happy-hour / deal story targets NON-ALCOHOLIC items only (PM rule O6). A BOGO / buy-X-get-Y rule is Phase 3 (G3.2) and has
 *     no column on main or in _pending_pm, so the happy-hour story is modelled as 50% off the non-alcoholic items in a weekday window.
 *   - "alcohol excluded" from the whole-menu promo: there is no exclude list yet (Phase 3 G3.1 adds target_kind + exclude), so the promo
 *     targets every PUBLISHED non-alcoholic product explicitly (promo_targets) and nothing else.
 *   - variant-scoped = an event promo with event_id + variant_id; the legacy row = event_id only (the table's original shape).
 */
import { insert, isoDays, s2Id } from "./stage2-ops.mjs";
import { T1_WS } from "./stage2-plan-t1.mjs";
import { T5_WS } from "./stage2-plan-t5.mjs";

export const PROMO_CODES = {
  percent: "BIENVENIDO10", fixed: "DESC50", mondayBurrito: "LUNES30", race1: "RACE1", race3: "RACE3", friday: "FRIDAY30",
  paused: "PAUSADO10", expired: "VENCIDO10", variant: "VIPDJ20", legacy: "DJLEGADO",
};

const iso = (d) => d.toISOString();

function row(ws, key, o) {
  return insert(o.fx ?? "PR", "public.tenant_promo_codes", `promo:${key}`, {
    id: s2Id(`promo:${key}`), tenant_id: ws, code: o.code ?? null, name: o.name, kind: o.kind ?? "percent", offer_kind: o.offerKind ?? o.kind ?? "percent",
    value: o.value, currency: "MXN", per_customer_limit: 1, scope_kind: o.scope ?? "all", audience: o.audience ?? "public", unlock: o.unlock ?? "code",
    applies_on: "purchase", tz: "America/Cancun", is_active: true, is_draft: false, is_paused: Boolean(o.paused), show_on_site: false,
    ...(o.maxRedemptions ? { max_redemptions: o.maxRedemptions } : {}),
    ...(o.budget ? { budget_cap_cents: o.budget } : {}),
    ...(o.weekdays ? { weekdays: o.weekdays } : {}),
    ...(o.from ? { time_from: o.from, time_to: o.to } : {}),
    ...(o.startsAt ? { starts_at: o.startsAt } : {}),
    ...(o.endsAt ? { ends_at: o.endsAt } : {}),
    ...(o.eventKey ? { event_id: s2Id(`event:${o.eventKey}`) } : {}),
    ...(o.variantKey ? { variant_id: s2Id(`variant:${o.variantKey}`) } : {}),
  });
}

const targets = (fx, promoKey, kind, ids) =>
  ids.map((id) => insert(fx, "public.promo_targets", `target:${promoKey}:${id.slice(0, 8)}`, { promo_id: s2Id(`promo:${promoKey}`), target_kind: kind, target_id: id }, ["promo_id", "target_kind", "target_id"]));

/** Published, non-alcoholic PRODUCT offerings of a tenant, from planned ops (so the exclusion can never drift from the catalog). */
export function nonAlcoholProducts(planned, ws) {
  return planned
    .filter((o) => o.table === "public.talent_offerings" && o.row.tenant_id === ws && o.row.kind === "product" && o.row.status === "published" && o.row.visibility === "public")
    .filter((o) => JSON.parse(o.row.attributes ?? "{}").alcohol !== true)
    .map((o) => o.id);
}

export function planPromos(at, planned) {
  const fx = "PR";
  const ws = T1_WS;
  const ops = [];
  const burrito = s2Id("offering:t1-burrito");
  const burger = s2Id("offering:t1-hamburguesa");
  const menu = nonAlcoholProducts(planned, ws);
  const add = (...xs) => ops.push(...xs);

  // ---- codes
  add(
    row(ws, "t1-percent", { code: PROMO_CODES.percent, name: "Bienvenida 10%", value: 10 }),
    row(ws, "t1-fixed", { code: PROMO_CODES.fixed, name: "50 pesos de descuento", kind: "fixed", value: 5000 }),
    row(ws, "t1-lunes-burrito", { code: PROMO_CODES.mondayBurrito, name: "Burrito a 30 los lunes", kind: "fixed", offerKind: "fixed_price", value: 3000, scope: "products", weekdays: [1] }),
    ...targets(fx, "t1-lunes-burrito", "product", [burrito]),
    row(ws, "t1-race1", { code: PROMO_CODES.race1, name: "Carrera 1 uso", value: 15, maxRedemptions: 1 }),
    row(ws, "t1-race3", { code: PROMO_CODES.race3, name: "Carrera 3 usos", value: 15, maxRedemptions: 3 }),
    row(ws, "t1-friday30", { code: PROMO_CODES.friday, name: "Viernes 30%", value: 30, weekdays: [5] }),
  );

  // ---- automatic
  add(
    row(ws, "t1-auto20", { name: "20% automático", unlock: "auto", value: 20 }),
    row(ws, "t1-media-hamburguesa", { name: "50% en la hamburguesa", unlock: "auto", value: 50, scope: "products" }),
    ...targets(fx, "t1-media-hamburguesa", "product", [burger]),
    // 30% on the whole (non-alcoholic) menu: capped at 200 redemptions and a MXN 5,000 budget. Alcohol is simply never a target.
    row(ws, "t1-menu30", { name: "30% en el menú sin alcohol", unlock: "auto", value: 30, scope: "products", maxRedemptions: 200, budget: 500000 }),
    ...targets(fx, "t1-menu30", "product", menu),
    // The happy-hour story, non-alcoholic only: 50% on the two deal drinks, weekdays 17:00-19:00 local.
    row(ws, "t1-happy", { name: "Happy hour sin alcohol", unlock: "auto", value: 50, scope: "products", weekdays: [1, 2, 3, 4, 5], from: "17:00", to: "19:00" }),
    ...targets(fx, "t1-happy", "product", [s2Id("offering:t1-limonada"), s2Id("offering:t1-jamaica")]),
  );

  // ---- states and scopes
  add(
    row(ws, "t1-paused", { code: PROMO_CODES.paused, name: "Pausada", value: 10, paused: true }),
    row(ws, "t1-expired", { code: PROMO_CODES.expired, name: "Vencida", value: 10, startsAt: iso(new Date(at.getTime() - 30 * 86400000)), endsAt: isoDays(at, -2) }),
    // Paid-plan-only: an audience promo with no end date can only be live on a paid plan (lib/promos/plan-gating.ts); on a downgrade it goes to draft.
    row(ws, "t1-nuevos", { name: "Clientes nuevos 15%", unlock: "auto", audience: "new_clients", value: 15 }),
    // Variant-scoped: the DJ VIP tier only. Legacy: the table's original event_id-only shape.
    row(ws, "t1-vip-dj", { code: PROMO_CODES.variant, name: "VIP del DJ 20%", value: 20, eventKey: "dj", variantKey: "dj-vip" }),
    row(ws, "t1-legacy-event", { code: PROMO_CODES.legacy, name: "Evento DJ (fila heredada)", value: 10, eventKey: "dj" }),
  );

  // ---- T5: happy hour on the two non-alcoholic deal drinks
  add(
    row(T5_WS, "t5-happy", { fx: "PR", name: "Happy hour de bebidas", unlock: "auto", value: 50, scope: "products", weekdays: [1, 2, 3, 4, 5], from: "16:00", to: "18:00" }),
    ...targets(fx, "t5-happy", "product", [s2Id("offering:smoothie"), s2Id("offering:agua-coco")]),
  );
  return ops;
}
