import assert from "node:assert/strict";
import { test } from "node:test";

import type { Promo } from "../types";
import {
  audienceVisible, capAllows, compareWidgetPromos, countdownBreakdown, localKeyToMs, nextCapRecord, normalizePath,
  pageAllowed, parseCapRecord, pickWidgetPromos, promoEndsAtMs, scheduleOpen, scrollPercent, toWidgetPromo, widgetView,
} from "./model";
import type { WidgetPromo } from "./types";

const TZ = "America/Mexico_City";
const promo = (over: Partial<Promo> = {}): Promo => ({
  id: "p1", offer_kind: "percent", value: 20, currency: "MXN", scope: "all", audience: "public", unlock: "auto",
  applies_on: "purchase", tz: TZ, ...over,
});
const wp = (over: Partial<WidgetPromo> = {}): WidgetPromo => ({
  id: "p1", offerKind: "percent", value: 20, currency: "MXN", unlock: "auto", audience: "public", scope: "all", tz: TZ,
  code: null, endsAtMs: null, showCountdown: false, showOnSite: true, title: null, description: null, left: null, ...over,
});

test("localKeyToMs resolves a wall-clock key in the promo's timezone", () => {
  // Mexico City is UTC-6 all year since 2022.
  assert.equal(localKeyToMs("2026-10-14T23:59:59", TZ), Date.UTC(2026, 9, 15, 5, 59, 59));
  assert.equal(localKeyToMs("nope", TZ), null);
});

test("a date-only end runs to 23:59:59 local, as an instant", () => {
  assert.equal(promoEndsAtMs({ ends_at: "2026-10-14", tz: TZ }), Date.UTC(2026, 9, 15, 5, 59, 59));
  assert.equal(promoEndsAtMs({ ends_at: null, tz: TZ }), null);
});

test("countdownBreakdown splits days, hours, minutes, seconds and stops at zero", () => {
  assert.deepEqual(countdownBreakdown(1000 * (86_400 + 3600 * 2 + 60 * 3 + 4), 0), { d: 1, h: 2, m: 3, s: 4 });
  assert.equal(countdownBreakdown(1000, 1000), null);
  assert.equal(countdownBreakdown(Number.NaN, 0), null);
});

test("audience: new, returning, signed in, guest, everyone", () => {
  const guestNew = { returning: false, signedIn: false };
  const memberBack = { returning: true, signedIn: true };
  assert.equal(audienceVisible(undefined, guestNew), true);
  assert.equal(audienceVisible("new", guestNew), true);
  assert.equal(audienceVisible("new", memberBack), false);
  assert.equal(audienceVisible("returning", memberBack), true);
  assert.equal(audienceVisible("returning", guestNew), false);
  assert.equal(audienceVisible("signed_in", guestNew), false);
  assert.equal(audienceVisible("guest", memberBack), false);
  assert.equal(audienceVisible("guest", guestNew), true);
});

test("schedule: bounds are local to the promo tz, malformed bounds are ignored", () => {
  const noon = Date.UTC(2026, 9, 14, 18, 0, 0); // 12:00 in Mexico City
  assert.equal(scheduleOpen(noon, "2026-10-14", "2026-10-14", TZ), true);
  assert.equal(scheduleOpen(noon, "2026-10-15", undefined, TZ), false);
  assert.equal(scheduleOpen(noon, undefined, "2026-10-13", TZ), false);
  assert.equal(scheduleOpen(noon, "2026-10-14T12:30", undefined, TZ), false);
  assert.equal(scheduleOpen(noon, "garbage", "also garbage", TZ), true);
});

test("pages: all, only, except; locale prefix and wildcard", () => {
  assert.equal(normalizePath("/es/menu/?x=1#a"), "/menu");
  assert.equal(normalizePath("/es"), "/");
  assert.equal(pageAllowed("all", "/menu", "/anything"), true);
  assert.equal(pageAllowed("only", "", "/anything"), true, "an empty list never hides the block");
  assert.equal(pageAllowed("only", "/, /menu", "/en"), true);
  assert.equal(pageAllowed("only", "/menu", "/contact"), false);
  assert.equal(pageAllowed("except", "/policies/*", "/es/policies/refunds"), false);
  assert.equal(pageAllowed("except", "/policies/*", "/menu"), true);
  assert.equal(pageAllowed("only", "/policies/*", "/policiesx"), false);
});

test("best promo: biggest percent first, then money off, gifts last; ties break on end then id", () => {
  const a = wp({ id: "a", value: 10 });
  const b = wp({ id: "b", value: 25 });
  const c = wp({ id: "c", offerKind: "fixed", value: 50_000 });
  const d = wp({ id: "d", offerKind: "free_addon" });
  assert.deepEqual([d, c, a, b].sort(compareWidgetPromos).map((p) => p.id), ["b", "a", "c", "d"]);
  const sooner = wp({ id: "z", value: 25, endsAtMs: 5 });
  assert.ok(compareWidgetPromos(sooner, b) < 0);
});

test("pick: a chosen promo shows even off-site; a lapsed choice shows nothing; auto-pick needs show_on_site", () => {
  const hidden = wp({ id: "h", showOnSite: false });
  const shown = wp({ id: "s", value: 15 });
  assert.deepEqual(pickWidgetPromos([hidden, shown], {}, 0).map((p) => p.id), ["s"]);
  assert.deepEqual(pickWidgetPromos([hidden, shown], { promoId: "h" }, 0).map((p) => p.id), ["h"]);
  assert.deepEqual(pickWidgetPromos([wp({ id: "old", endsAtMs: 10 })], { promoId: "old" }, 11), []);
  assert.deepEqual(pickWidgetPromos([wp({ id: "old", endsAtMs: 10 })], {}, 11), []);
  assert.deepEqual(pickWidgetPromos([hidden], {}, 0), []);
});

test("cards take up to maxCards of the best, clamped 1..6", () => {
  const many = Array.from({ length: 8 }, (_, i) => wp({ id: `p${i}`, value: i + 1 }));
  assert.equal(pickWidgetPromos(many, { variant: "cards" }, 0).length, 3);
  assert.equal(pickWidgetPromos(many, { variant: "cards", maxCards: 99 }, 0).length, 6);
  assert.equal(pickWidgetPromos(many, { variant: "cards", maxCards: 0 }, 0).length, 1);
  assert.equal(pickWidgetPromos(many, { variant: "banner" }, 0).length, 1);
});

test("toWidgetPromo drops personal offers and code promos without a code", () => {
  const base = { showCountdown: true, showOnSite: true, title: null, description: null, used: 0 };
  assert.equal(toWidgetPromo({ ...base, promo: promo({ audience: "one_client" }) }), null);
  assert.equal(toWidgetPromo({ ...base, promo: promo({ customer_id: "c1" }) }), null);
  assert.equal(toWidgetPromo({ ...base, promo: promo({ is_single_use: true }) }), null);
  assert.equal(toWidgetPromo({ ...base, promo: promo({ unlock: "code", code: " " }) }), null);
  const ok = toWidgetPromo({ ...base, promo: promo({ unlock: "code", code: "luz10" }) });
  assert.equal(ok?.code, "LUZ10");
});

test("a code never rides along on an auto or link promo", () => {
  const base = { showCountdown: false, showOnSite: true, title: null, description: null, used: 0 };
  assert.equal(toWidgetPromo({ ...base, promo: promo({ unlock: "auto", code: "SECRET" }) })?.code, null);
  assert.equal(toWidgetPromo({ ...base, promo: promo({ unlock: "link", code: "SECRET" }) })?.code, null);
});

test("scarcity is said only when 5 or fewer are left", () => {
  const base = { showCountdown: false, showOnSite: true, title: null, description: null };
  assert.equal(toWidgetPromo({ ...base, used: 0, promo: promo({ max_uses: 20 }) })?.left, null);
  assert.equal(toWidgetPromo({ ...base, used: 17, promo: promo({ max_uses: 20 }) })?.left, 3);
  assert.equal(toWidgetPromo({ ...base, used: 20, promo: promo({ max_uses: 20 }) })?.left, null);
});

test("widgetView: ES default, EN on request, talent copy wins, title is the body fallback", () => {
  const p = wp({ title: { es: "Semana de lanzamiento", en: "Launch week" } });
  const es = widgetView(p, {}, "es");
  assert.equal(es.headline, "Obtén 20% de descuento");
  assert.equal(es.body, "Semana de lanzamiento");
  const en = widgetView(p, {}, "en");
  assert.equal(en.headline, "Get 20% off");
  assert.equal(en.body, "Launch week");
  assert.equal(widgetView(p, { headline: "Solo hoy", body: "Reserva ya" }, "en").headline, "Solo hoy");
  assert.equal(widgetView(wp({ offerKind: "fixed", value: 10_000 }), {}, "en").offer.includes("off"), true);
});

test("the view carries the code only for code promos and no em dashes", () => {
  const v = widgetView(wp({ unlock: "code", code: "LUZ10" }), {}, "es");
  assert.equal(v.code, "LUZ10");
  assert.equal(widgetView(wp(), {}, "es").code, null);
  assert.ok(!JSON.stringify([widgetView(wp(), {}, "es"), widgetView(wp(), {}, "en")]).includes("—"));
});

test("frequency cap: session and once stop after one show, daily and weekly wait, always never stops", () => {
  const now = 10 * 86_400_000;
  const rec = { lastMs: now - 3_600_000, count: 1 };
  assert.equal(capAllows("session", null, now), true);
  assert.equal(capAllows("session", rec, now), false);
  assert.equal(capAllows("once", rec, now), false);
  assert.equal(capAllows("daily", rec, now), false);
  assert.equal(capAllows("daily", { lastMs: now - 86_400_000, count: 1 }, now), true);
  assert.equal(capAllows("weekly", { lastMs: now - 6 * 86_400_000, count: 1 }, now), false);
  assert.equal(capAllows("weekly", { lastMs: now - 7 * 86_400_000, count: 1 }, now), true);
  assert.equal(capAllows("always", rec, now), true);
  assert.equal(capAllows(undefined, rec, now), false, "default is once per session");
});

test("cap records survive junk storage", () => {
  assert.equal(parseCapRecord(null), null);
  assert.equal(parseCapRecord("{not json"), null);
  assert.equal(parseCapRecord('"str"'), null);
  assert.equal(parseCapRecord('{"lastMs":"x"}'), null);
  assert.deepEqual(parseCapRecord('{"lastMs":5,"count":2}'), { lastMs: 5, count: 2 });
  assert.deepEqual(nextCapRecord({ lastMs: 1, count: 2 }, 9), { lastMs: 9, count: 3 });
  assert.deepEqual(nextCapRecord(null, 9), { lastMs: 9, count: 1 });
});

test("scrollPercent clamps and tolerates pages that do not scroll", () => {
  assert.equal(scrollPercent(0, 800, 800), 0);
  assert.equal(scrollPercent(500, 1800, 800), 50);
  assert.equal(scrollPercent(5000, 1800, 800), 100);
});
