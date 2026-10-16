import test from "node:test";
import assert from "node:assert/strict";

import type { Promo } from "@/lib/promos/types";
import { buildCaption, conditionLine, offerBadge, offerHeadline, weekdaysText } from "./captions";
import { sessionHash, isUuid } from "./cookies";
import { handlePromoEvent, type PromoEventDeps, type EventPromoRef } from "./events";
import { buildPromoLink, isValidPromoSlug, parseVia, promoPath, whatsappHref } from "./links";
import { classifyLanding, landingTarget } from "./landing-core";
import { signPersonalToken, verifyPersonalToken } from "./token";

const base: Promo = {
  id: "11111111-1111-4111-8111-111111111111",
  offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public",
  unlock: "link", applies_on: "appointment", tz: "America/Mexico_City",
};
const NOW = "2026-10-14T18:00:00Z";

test("links: site and hub paths, via, token", () => {
  assert.equal(promoPath("empty-week"), "/p/empty-week");
  assert.equal(promoPath("empty-week", "TAL-1"), "/t/TAL-1/p/empty-week");
  assert.equal(
    buildPromoLink({ origin: "https://ana.example.com/", slug: "x", via: "wa" }),
    "https://ana.example.com/p/x?via=wa",
  );
  assert.equal(
    buildPromoLink({ origin: "https://h.co", slug: "x", profileCode: "TAL-9", via: "email", token: "a.b" }),
    "https://h.co/t/TAL-9/p/x?via=email&t=a.b",
  );
  assert.equal(parseVia("qr_print"), "qr_print");
  assert.equal(parseVia("utm_source"), null);
  assert.equal(parseVia(undefined), null);
  assert.ok(isValidPromoSlug("empty-week-20"));
  assert.ok(!isValidPromoSlug("Bad Slug"));
  assert.ok(!isValidPromoSlug("../x"));
  assert.ok(whatsappHref("hola mundo & más").startsWith("https://wa.me/?text=hola%20mundo"));
});

test("token: round trip, wrong promo, tampered, no secret", async () => {
  const t = await signPersonalToken("s3cret", base.id);
  assert.ok(!t.includes(base.id), "promo id is not readable in the token");
  assert.equal(await verifyPersonalToken(t, "s3cret", base.id), true);
  assert.equal(await verifyPersonalToken(t, "s3cret", "22222222-2222-4222-8222-222222222222"), false);
  assert.equal(await verifyPersonalToken(t + "x", "s3cret", base.id), false);
  assert.equal(await verifyPersonalToken(t, "other", base.id), false);
  assert.equal(await verifyPersonalToken(t, undefined, base.id), false);
  assert.equal(await verifyPersonalToken(null, "s3cret", base.id), false);
});

test("cookies: session hash is stable, not the id; uuid check", () => {
  const h = sessionHash("abc");
  assert.equal(h, sessionHash("abc"));
  assert.notEqual(h, "abc");
  assert.equal(h.length, 32);
  assert.ok(isUuid(base.id));
  assert.ok(!isUuid("nope"));
});

test("captions: offer text in ES and EN, weekdays, spots", () => {
  assert.equal(offerHeadline(base, "es"), "20% de descuento");
  assert.equal(offerHeadline(base, "en"), "20% off");
  assert.equal(offerBadge(base, "es"), "-20%");
  assert.equal(offerHeadline({ ...base, offer_kind: "fixed", value: 10000 }, "es"), "$100 de descuento");
  assert.equal(offerHeadline({ ...base, offer_kind: "free_addon" }, "es", "Nail art"), "Nail art gratis");
  assert.equal(weekdaysText([1, 2, 3], "es"), "lunes a miércoles");
  assert.equal(weekdaysText([1, 4], "es"), "lunes y jueves");
  assert.equal(weekdaysText([0, 1, 2, 3, 4, 5, 6], "es"), null);
  assert.equal(weekdaysText([], "en"), null);
  assert.equal(conditionLine({ ...base, weekdays: [1, 2, 3], max_uses: 3 }, "es"), "lunes a miércoles · solo 3 lugares");
  assert.equal(conditionLine({ ...base, max_uses: 1 }, "en"), "only 1 spot");
  const cap = buildCaption({ promo: { ...base, weekdays: [1, 2, 3], max_uses: 3 }, lang: "es", link: "https://x/p/a?via=wa", hashtags: ["manicure"] });
  assert.match(cap, /Reserva aquí: https:\/\/x\/p\/a\?via=wa/);
  assert.match(cap, /#manicure/);
  assert.ok(!/[—–]/.test(cap), "no em or en dashes");
  assert.match(buildCaption({ promo: base, lang: "en", link: "L" }), /Book here: L/);
});

test("landing: every state is classified, never throws", () => {
  const c = (p: Promo | null, extra: Partial<Parameters<typeof classifyLanding>[0]> = {}) =>
    classifyLanding({ promo: p, now: NOW, tokenOk: false, ...extra });
  assert.equal(c(null).state, "gone");
  assert.equal(c({ ...base, is_draft: true }).state, "gone");
  const live = c(base);
  assert.equal(live.state, "live");
  assert.equal(live.applyCookie, true);
  assert.equal(live.robotsHeader, false);
  assert.equal(c({ ...base, ends_at: "2026-10-01" }).state, "ended");
  assert.equal(c({ ...base, ends_at: "2026-10-01" }).applyCookie, false);
  assert.equal(c({ ...base, is_paused: true }).state, "paused");
  assert.equal(c({ ...base, max_uses: 2 }, { usage: { used: 2 } }).state, "sold_out");
  assert.equal(c({ ...base, starts_at: "2026-12-01" }).state, "scheduled");
  assert.equal(c({ ...base, archived_at: "2026-10-01T00:00:00Z" }).state, "ended");
  assert.equal(c({ ...base, archived_at: "2026-01-01T00:00:00Z" }).state, "gone");
  // code pages send X-Robots-Tag
  assert.equal(c({ ...base, unlock: "code", code: "ANA20" }).robotsHeader, true);
  // personal: locked without token, normal with one
  const personal = { ...base, audience: "one_client" as const, customer_id: "c1" };
  const locked = c(personal);
  assert.equal(locked.state, "personal_locked");
  assert.equal(locked.applyCookie, false);
  assert.equal(locked.robotsHeader, true);
  assert.equal(c(personal, { tokenOk: true }).state, "live");
});

test("landing target: one service lands on it, else home", () => {
  assert.deepEqual(landingTarget({ ...base, scope: "services", target_ids: ["s1"] }), { kind: "service", serviceId: "s1" });
  assert.deepEqual(landingTarget({ ...base, scope: "services", target_ids: ["s1", "s2"] }), { kind: "home" });
  assert.deepEqual(landingTarget(base), { kind: "home" });
});

function deps(over: Partial<PromoEventDeps> = {}, ref: Partial<EventPromoRef> | null = {}) {
  const inserted: unknown[] = [];
  const d: PromoEventDeps = {
    loadPromo: async () => (ref === null ? null : { id: base.id, tenant_id: "t1", is_draft: false, archived_at: null, personal: false, ...ref }),
    verifyToken: async (t) => t === "good",
    allow: async () => true,
    insert: async (row) => { inserted.push(row); return true; },
    ...over,
  };
  return { d, inserted };
}
const ev = (o: Record<string, unknown> = {}) => ({ promoId: base.id, kind: "link_open", via: "wa", sessionHash: "h", ip: "1.1.1.1", ...o });

test("event: link_open inserts with via and pins the promo", async () => {
  const { d, inserted } = deps();
  const r = await handlePromoEvent(d, ev());
  assert.deepEqual(r, { ok: true, applyCookie: true, via: "wa", promoId: base.id });
  assert.deepEqual(inserted, [{ promo_id: base.id, tenant_id: "t1", kind: "link_open", session_hash: "h", via: "wa" }]);
});

test("event: share does not pin; unknown via is dropped", async () => {
  const { d, inserted } = deps();
  const r = await handlePromoEvent(d, ev({ kind: "share", via: "evil" }));
  assert.equal(r.ok && r.applyCookie, false);
  assert.equal((inserted[0] as { via: unknown }).via, null);
});

test("event: validation, 404, rate limit, db failure", async () => {
  assert.deepEqual(await handlePromoEvent(deps().d, ev({ promoId: "x" })), { ok: false, status: 400 });
  assert.deepEqual(await handlePromoEvent(deps().d, ev({ kind: "code_fail" })), { ok: false, status: 400 });
  assert.deepEqual(await handlePromoEvent(deps({}, null).d, ev()), { ok: false, status: 404 });
  assert.deepEqual(await handlePromoEvent(deps({}, { is_draft: true }).d, ev()), { ok: false, status: 404 });
  const limited = deps({ allow: async () => false });
  assert.deepEqual(await handlePromoEvent(limited.d, ev()), { ok: false, status: 429 });
  assert.equal(limited.inserted.length, 0);
  assert.deepEqual(await handlePromoEvent(deps({ insert: async () => false }).d, ev()), { ok: false, status: 500 });
});

test("event: personal promo needs a valid token", async () => {
  const a = deps({}, { personal: true });
  assert.deepEqual(await handlePromoEvent(a.d, ev()), { ok: false, status: 404 });
  assert.equal(a.inserted.length, 0);
  const b = deps({}, { personal: true });
  assert.equal((await handlePromoEvent(b.d, ev({ token: "good" }))).ok, true);
});
