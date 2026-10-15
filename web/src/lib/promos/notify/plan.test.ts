import { test } from "node:test";
import assert from "node:assert/strict";

import { planPromoNotifications, promoEvents, type PromoNotifyInput } from "./plan";
import { canMessageClient } from "./client-optin";

const NOW = new Date("2026-10-14T15:00:00Z");
function p(over: Partial<PromoNotifyInput> = {}): PromoNotifyInput {
  return { promoId: "p1", tenantId: "t1", name: "Llena tu semana", maxUses: 10, used: 3, endsAtIso: null, recipientUserIds: ["u1"], isLive: true, ...over };
}
const kinds = (i: PromoNotifyInput) => promoEvents(i, NOW).map((e) => e.kind);

test("two left only when max >= 5", () => {
  assert.deepEqual(kinds(p({ used: 8 })), ["two_left"]);
  assert.deepEqual(kinds(p({ maxUses: 4, used: 2 })), []);
  assert.deepEqual(kinds(p({ used: 7 })), []);
});

test("sold out carries the result and wins over everything else", () => {
  const i = p({ used: 10, result: { bookings: 3, earnedCents: 1080_00, currency: "MXN" }, endsAtIso: "2026-10-15T00:00:00Z" });
  assert.deepEqual(kinds(i), ["sold_out"]);
  const [n] = planPromoNotifications([i], NOW, "es");
  assert.equal(n!.title, "¡Agotada! Llena tu semana");
  assert.ok(n!.body!.startsWith("3 citas, "));
  assert.ok(n!.body!.includes("1,080"));
  assert.equal(n!.originEventId, "promo:p1:sold_out:10");
});

test("expires tomorrow only inside 24h, under 80% used, with a cap", () => {
  assert.deepEqual(kinds(p({ endsAtIso: "2026-10-15T10:00:00Z" })), ["expires_tomorrow"]);
  assert.deepEqual(kinds(p({ endsAtIso: "2026-10-16T10:00:00Z" })), []);
  assert.deepEqual(kinds(p({ endsAtIso: "2026-10-14T10:00:00Z" })), []);
  assert.deepEqual(kinds(p({ endsAtIso: "2026-10-15T10:00:00Z", used: 8 })).includes("expires_tomorrow"), false);
  assert.deepEqual(kinds(p({ endsAtIso: "2026-10-15T10:00:00Z", maxUses: null })), []);
});

test("spot back: one left and a recent release", () => {
  assert.deepEqual(kinds(p({ used: 9, lastSpotReleasedAtIso: "2026-10-14T14:00:00Z" })), ["spot_back"]);
  assert.deepEqual(kinds(p({ used: 9, lastSpotReleasedAtIso: "2026-10-14T10:00:00Z" })), []);
  assert.deepEqual(kinds(p({ used: 8, lastSpotReleasedAtIso: "2026-10-14T14:00:00Z" })), ["two_left"]);
});

test("paused or not live promos only report sold out", () => {
  assert.deepEqual(kinds(p({ used: 8, isLive: false })), []);
});

test("ids are deterministic so re-runs dedupe", () => {
  const a = planPromoNotifications([p({ used: 8 })], NOW);
  const b = planPromoNotifications([p({ used: 8 })], new Date(NOW.getTime() + 60_000));
  assert.deepEqual(a.map((x) => x.originEventId), b.map((x) => x.originEventId));
});

test("3 or more for a user bundle into one stable row", () => {
  const mk = (id: string) => p({ promoId: id, maxUses: 5, used: 3, endsAtIso: "2026-10-15T10:00:00Z", name: id });
  const inputs = [mk("a"), mk("b")]; // two_left + expires each = 4 rows for u1
  const out = planPromoNotifications(inputs, NOW);
  assert.equal(out.length, 1);
  assert.ok(out[0]!.title.startsWith("4 novedades"));
  assert.equal(planPromoNotifications(inputs, NOW)[0]!.originEventId, out[0]!.originEventId);
  const two = planPromoNotifications([mk("a")], NOW);
  assert.equal(two.length, 2);
});

test("recipients each get their own row", () => {
  assert.equal(planPromoNotifications([p({ used: 8, recipientUserIds: ["u1", "u2"] })], NOW).length, 2);
});

test("client messaging is opt-in with a monthly cap of 2", () => {
  assert.deepEqual(canMessageClient({ optedIn: false, sentThisMonth: 0 }), { ok: false, reason: "not_opted_in" });
  assert.deepEqual(canMessageClient({ optedIn: true, unsubscribed: true, sentThisMonth: 0 }), { ok: false, reason: "unsubscribed" });
  assert.deepEqual(canMessageClient({ optedIn: true, sentThisMonth: 2 }), { ok: false, reason: "monthly_cap" });
  assert.deepEqual(canMessageClient({ optedIn: true, sentThisMonth: 1 }), { ok: true, remaining: 1 });
});
