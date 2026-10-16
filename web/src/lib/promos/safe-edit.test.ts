import { test } from "node:test";
import assert from "node:assert/strict";

import { applyEdit, classifyEdit, downgradeOutcome, downgradeSummary, endNowPatch } from "./safe-edit";
import { buildDraft, draftToPromo, type PromoDraft } from "./templates";

const MX = "America/Mexico_City";
const base: PromoDraft = {
  ...buildDraft("fill_week", { now: "2026-10-12T10:00:00-06:00", tz: MX, currency: "MXN", locale: "es" }),
  id: "p1",
  code: "LUZ10",
  unlock: "code",
};

test("before any use everything is editable", () => {
  const v = classifyEdit(base, { ...base, offer_kind: "fixed", value: 5000, code: "OTRO", audience: "returning" }, 0);
  assert.equal(v.ok, true);
  assert.deepEqual(v.locked, []);
});

test("after first use the offer type, code and audience are locked and reverted", () => {
  const next = { ...base, offer_kind: "fixed" as const, value: 5000, code: "OTRO", audience: "returning" as const };
  const { draft, verdict } = applyEdit(base, next, 2);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.locked, ["offer_kind", "code", "audience"]);
  assert.equal(verdict.suggestDuplicate, true);
  assert.equal(draft.offer_kind, "percent");
  assert.equal(draft.value, 20);
  assert.equal(draft.code, "LUZ10");
  assert.equal(draft.audience, "public");
});

test("code compare ignores case", () => {
  assert.equal(classifyEdit(base, { ...base, code: "luz10" }, 3).ok, true);
});

test("safe changes: name, later end, more uses, more services are not restricting", () => {
  const next = { ...base, name: "Otro", ends_at: "2026-10-25", max_uses: 10 };
  const v = classifyEdit(base, next, 2);
  assert.deepEqual(v.restricting, []);
  assert.equal(v.keepsTerms, false);
});

test("restricting changes are allowed and keep terms for people who booked", () => {
  const next = { ...base, value: 15, ends_at: "2026-10-14", max_uses: 2, target_ids: ["s1"] };
  const v = classifyEdit(base, next, 3);
  assert.equal(v.ok, true);
  assert.deepEqual(v.restricting, ["lower_value", "earlier_end", "fewer_uses", "fewer_services"]);
  assert.equal(v.keepsTerms, true);
  assert.equal(classifyEdit(base, next, 0).keepsTerms, false);
});

test("a raised fixed price is restricting; removing the end date is not", () => {
  const fp = { ...base, offer_kind: "fixed_price" as const, value: 30000 };
  assert.deepEqual(classifyEdit(fp, { ...fp, value: 35000 }, 1).restricting, ["lower_value"]);
  assert.deepEqual(classifyEdit(base, { ...base, ends_at: null }, 1).restricting, []);
  assert.deepEqual(classifyEdit({ ...base, ends_at: null }, { ...base, ends_at: "2026-11-01" }, 1).restricting, ["earlier_end"]);
});

test("end now: live promo expires one second ago; unstarted is archived", () => {
  const now = new Date("2026-10-14T18:00:00Z");
  const live = draftToPromo({ ...base, starts_at: "2026-10-12", ends_at: "2026-10-18" });
  const live2 = { ...live, starts_at: "2026-10-12T06:00:00.000Z" };
  assert.deepEqual(endNowPatch(live2, now), { kind: "expire", ends_at: "2026-10-14T17:59:59.000Z" });
  const future = { ...live, starts_at: "2026-10-20T06:00:00.000Z" };
  assert.deepEqual(endNowPatch(future, now), { kind: "archive", archived_at: "2026-10-14T18:00:00.000Z" });
  assert.equal(endNowPatch({ starts_at: null, tz: MX }, now).kind, "expire");
});

const D0 = "2026-10-14T12:00:00-06:00";
const P = { tz: MX, audience: "public" as const, is_single_use: false, is_trial: false, is_draft: false, archived_at: null };

test("downgrade: dated promo runs to its end, capped at 30 days", () => {
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: "2026-10-20" }, "live", D0), { action: "end_on", endDate: "2026-10-20" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: "2027-03-01" }, "live", D0), { action: "end_on", endDate: "2026-11-13" });
});

test("downgrade: open-ended ends in 14 days", () => {
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null }, "live", D0), { action: "end_on", endDate: "2026-10-28" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null }, "paused", D0), { action: "end_on", endDate: "2026-10-28" });
});

test("downgrade: scheduled goes back to draft; personal and trial are kept; ended is untouched", () => {
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null }, "scheduled", D0), { action: "to_draft" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null, audience: "one_client" }, "live", D0), { action: "keep" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null, is_trial: true }, "live", D0), { action: "keep" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null }, "expired", D0), { action: "none" });
  assert.deepEqual(downgradeOutcome({ ...P, ends_at: null }, "draft", D0), { action: "none" });
});

test("downgrade summary counts promos and finds the first end", () => {
  const s = downgradeSummary(
    [
      { promo: { ...P, ends_at: null }, status: "live" },
      { promo: { ...P, ends_at: "2026-10-20" }, status: "live" },
      { promo: { ...P, ends_at: null }, status: "scheduled" },
    ],
    D0,
  );
  assert.deepEqual(s, { endingCount: 2, firstEnd: "2026-10-20", toDraftCount: 1 });
});
