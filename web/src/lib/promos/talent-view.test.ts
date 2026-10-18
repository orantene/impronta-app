import { test } from "node:test";
import assert from "node:assert/strict";

import { canSharePromo, formatMoney, groupByTab, progressOf, promoAttention, tabOf } from "./talent-view";
import { PROMO_COPY_EN, PROMO_COPY_ES, promoCopy } from "./copy/talent";

const MX = "America/Mexico_City";

test("tabs: live holds paused and sold out; drafts wait with scheduled", () => {
  assert.equal(tabOf("live"), "live");
  assert.equal(tabOf("paused"), "live");
  assert.equal(tabOf("sold_out"), "live");
  assert.equal(tabOf("scheduled"), "scheduled");
  assert.equal(tabOf("draft"), "scheduled");
  assert.equal(tabOf("expired"), "past");
  assert.equal(tabOf("archived"), "past");
});

test("live tab sorts the soonest end first, open-ended last", () => {
  const g = groupByTab([
    { id: "a", status: "live" as const, created_at: "1", ends_at: null, tz: MX },
    { id: "b", status: "live" as const, created_at: "2", ends_at: "2026-10-20", tz: MX },
    { id: "c", status: "live" as const, created_at: "3", ends_at: "2026-10-16", tz: MX },
  ]);
  assert.deepEqual(g.live.map((x) => x.id), ["c", "b", "a"]);
});

test("progress: single use is 1 spot; open-ended has no left", () => {
  assert.deepEqual(progressOf({ max_uses: 3, is_single_use: false }, 2), { used: 2, max: 3, left: 1, pct: 67 });
  assert.deepEqual(progressOf({ max_uses: null, is_single_use: true }, 0), { used: 0, max: 1, left: 1, pct: 0 });
  assert.deepEqual(progressOf({ max_uses: null, is_single_use: false }, 4), { used: 4, max: null, left: null, pct: 0 });
});

test("attention: sold out, ending within 48h, suggestion", () => {
  const now = "2026-10-14T12:00:00-06:00";
  const items = [
    { id: "a", status: "sold_out" as const, promo: { ends_at: null, tz: MX } },
    { id: "b", status: "live" as const, promo: { ends_at: "2026-10-15", tz: MX } },
    { id: "c", status: "live" as const, promo: { ends_at: "2026-10-30", tz: MX } },
    { id: "d", status: "paused" as const, promo: { ends_at: "2026-10-15", tz: MX } },
  ];
  assert.deepEqual(promoAttention(items, now), [
    { promoId: "a", kind: "sold_out" },
    { promoId: "b", kind: "ending_soon" },
  ]);
  assert.equal(promoAttention([], now, true)[0]?.kind, "suggestion");
});

test("money: whole pesos for MXN", () => {
  assert.match(formatMoney(36_000, "MXN", "es"), /360/);
  assert.doesNotMatch(formatMoney(36_000, "MXN", "es"), /\.00/);
});

test("copy: ES and EN carry the same keys, none empty, no em dashes", () => {
  assert.deepEqual(Object.keys(PROMO_COPY_EN).sort(), Object.keys(PROMO_COPY_ES).sort());
  for (const [k, v] of [...Object.entries(PROMO_COPY_ES), ...Object.entries(PROMO_COPY_EN)]) {
    assert.ok(v.length > 0, k);
    assert.ok(!v.includes("—"), `em dash in ${k}`);
  }
});

test("copy: interpolation and locale fallback", () => {
  assert.equal(promoCopy("es-MX").t("card.used", { used: 2, max: 3 }), "2 de 3 usadas");
  assert.equal(promoCopy("en").t("card.used", { used: 2, max: 3 }), "2 of 3 used");
  assert.equal(promoCopy("fr").locale, "en");
});

test("TUL-938: a draft cannot be shared (its share images 404); live and scheduled can", () => {
  assert.equal(canSharePromo("draft"), false);
  assert.equal(canSharePromo("archived"), false);
  assert.equal(canSharePromo("expired"), false);
  for (const s of ["live", "scheduled", "paused", "sold_out"] as const) assert.equal(canSharePromo(s), true);
  assert.ok(PROMO_COPY_ES["detail.share_after_publish"]);
  assert.ok(PROMO_COPY_EN["detail.share_after_publish"]);
});
