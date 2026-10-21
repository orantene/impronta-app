import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clientState, engagementEligibility, planReferralReward, signupUnlockCode, signupUnlockedCodes, REFERRAL_REWARD_DAYS,
} from "./engagement";
import { quote } from "./quote";
import { buildDraft, draftToColumns, draftToPromo, TEMPLATE_ORDER, validateDraft, type TemplateContext } from "./templates";
import { canGoLive } from "./plan-gating";
import type { CartLine, Client } from "./types";

const NOW = "2026-10-12T10:00:00-06:00";
const ctx = (over: Partial<TemplateContext> = {}): TemplateContext => ({ now: NOW, tz: "America/Mexico_City", currency: "MXN", locale: "es", ...over });
const pub = { audience: "public" as const, customer_id: null, is_single_use: false };

test("engagement templates build valid drafts with the planned shape", () => {
  const fb = buildDraft("first_booking", ctx());
  assert.deepEqual([fb.audience, fb.unlock, fb.value], ["new_clients", "auto", 20]);
  const ret = buildDraft("returning_reward", ctx());
  assert.equal(ret.audience, "returning");
  const ref = buildDraft("referral", ctx());
  assert.deepEqual([ref.audience, ref.unlock], ["new_clients", "link"]);
  const ld = buildDraft("limited_deal", ctx());
  assert.equal(ld.max_uses, 5);
  assert.equal(ld.ends_at, "2026-10-14");
  const sw = buildDraft("slow_week", ctx());
  assert.deepEqual(sw.weekdays, [1, 2, 3]);
  assert.deepEqual([sw.time_from, sw.time_to], ["10:00", "15:00"]);
  for (const k of ["first_booking", "signup_unlock", "returning_reward", "referral", "limited_deal", "slow_week"] as const) {
    assert.ok(TEMPLATE_ORDER.includes(k), k);
    assert.deepEqual(validateDraft(buildDraft(k, ctx())), [], k);
  }
});

test("signup_unlock maps to unlock=code with no new column and stays off the site", () => {
  const d = buildDraft("signup_unlock", ctx());
  assert.equal(d.requires_account, true);
  assert.equal(d.unlock, "code");
  const cols = draftToColumns(d);
  assert.equal(cols.template_key, "signup_unlock");
  assert.equal(cols.show_on_site, false);
  assert.equal("requires_account" in cols, false);
});

test("free plan: audience/code templates are paid; limited_deal and slow_week fit the trial", () => {
  const gate = (k: Parameters<typeof buildDraft>[0]) =>
    canGoLive({ plan: "free", trialUsed: false, promo: draftToPromo(buildDraft(k, ctx({ trialAvailable: true }))) }).allowed;
  assert.equal(gate("limited_deal"), true);
  assert.equal(gate("slow_week"), true);
  for (const k of ["first_booking", "signup_unlock", "returning_reward", "referral"] as const) {
    assert.equal(canGoLive({ plan: "free", trialUsed: false, promo: draftToPromo(buildDraft(k, ctx())) }).allowed, false, k);
    assert.equal(canGoLive({ plan: "paid", trialUsed: false, promo: draftToPromo(buildDraft(k, ctx())) }).allowed, true, k);
  }
});

test("engagementEligibility: new, returning, lapsed, guest, signed in", () => {
  const guest = { signedIn: false, status: "new" as const };
  const newer = { signedIn: true, status: "new" as const };
  const ret = { signedIn: true, status: "returning" as const };
  const lapsed = { signedIn: true, status: "lapsed" as const };
  assert.equal(clientState(guest), "guest");
  assert.equal(clientState(newer), "new");
  assert.equal(engagementEligibility(guest, { ...pub, audience: "new_clients" }).eligible, true);
  assert.equal(engagementEligibility(ret, { ...pub, audience: "new_clients" }).reason, "audience");
  assert.equal(engagementEligibility(newer, { ...pub, audience: "returning" }).eligible, false);
  assert.equal(engagementEligibility(lapsed, { ...pub, audience: "returning" }).eligible, true);
  assert.equal(engagementEligibility(ret, { ...pub, audience: "lapsed" }).eligible, false);
  // account gate
  const gated = { ...pub, requires_account: true };
  assert.deepEqual(engagementEligibility(guest, gated), { eligible: false, reason: "sign_in", state: "guest", showPrice: false });
  assert.equal(engagementEligibility(newer, gated).showPrice, true);
  // personal
  const personal = { audience: "one_client" as const, customer_id: "c1", is_single_use: true };
  assert.equal(engagementEligibility({ ...ret, customerId: "c1" }, personal).eligible, true);
  assert.equal(engagementEligibility({ ...ret, customerId: "c2" }, personal).reason, "personal");
});

test("eligibility agrees with quote() for audience templates", () => {
  const cart: CartLine[] = [{ id: "l1", kind: "service", target_id: "s1", list_cents: 45_000, qty: 1, currency: "MXN", appointment_start: "2026-10-13T12:00:00-06:00" }];
  const promo = draftToPromo(buildDraft("first_booking", ctx()), "p1");
  for (const status of ["new", "returning", "lapsed"] as const) {
    const client: Client = { status };
    const q = quote({ channel: "booking", cart, client, now: NOW, promos: [promo], usage: {}, unlocked: { codes: [], linkPromoIds: [] } });
    assert.equal(q.applied.length > 0, engagementEligibility({ signedIn: true, status }, promo).eligible, status);
  }
});

test("signup unlock: guest sees it locked, signed in gets the price via quote()", () => {
  const d = buildDraft("signup_unlock", ctx());
  const promo = draftToPromo(d, "p1");
  const cart: CartLine[] = [{ id: "l1", kind: "service", target_id: "s1", list_cents: 45_000, qty: 1, currency: "MXN", appointment_start: "2026-10-13T12:00:00-06:00" }];
  const run = (signedIn: boolean) =>
    quote({ channel: "booking", cart, client: { status: "new" }, now: NOW, promos: [promo], usage: {}, unlocked: { codes: signupUnlockedCodes({ signedIn }, promo), linkPromoIds: [] } });
  assert.equal(run(false).applied.length, 0);
  assert.equal(run(false).rejected[0]?.reason, "locked");
  assert.equal(run(true).applied.length, 1);
  assert.equal(run(true).totals.discount_cents, 4_500);
});

test("signupUnlockCode is deterministic, per account, and a valid code", () => {
  const a = signupUnlockCode("registro10", "acct-1");
  assert.equal(a, signupUnlockCode("REGISTRO10", "acct-1"));
  assert.notEqual(a, signupUnlockCode("REGISTRO10", "acct-2"));
  assert.match(a, /^REGISTRO10-[0-9A-Z]{4}$/);
});

const parent = { id: "p1", offer_kind: "percent", value: 15, currency: null };
const plan = (over: Partial<Parameters<typeof planReferralReward>[0]> = {}) =>
  planReferralReward({
    parent,
    redemption: { status: "confirmed", referredCustomerId: "new1", priorConfirmedCount: 0 },
    referrerCustomerId: "ref1",
    referrerFirstName: "Ana",
    now: new Date("2026-10-12T16:00:00Z"),
    randomInt: () => 0,
    ...over,
  });

test("referral: confirmed first redemption rewards the referrer with the same offer", () => {
  const r = plan();
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.reward.customer_id, "ref1");
  assert.equal(r.reward.value, 15);
  assert.equal(r.reward.offer_kind, "percent");
  assert.equal(r.reward.audience, "one_client");
  assert.equal(r.reward.unlock, "code");
  assert.equal(r.reward.max_redemptions, 1);
  assert.equal(r.reward.parent_promo_id, "p1");
  assert.match(r.reward.code, /^ANA-/);
  assert.equal(Date.parse(r.reward.ends_at) - Date.parse(r.reward.starts_at), REFERRAL_REWARD_DAYS * 86_400_000);
});

test("referral: no reward unless confirmed, first, distinct people", () => {
  const red = { status: "confirmed" as const, referredCustomerId: "new1", priorConfirmedCount: 0 };
  assert.deepEqual(plan({ redemption: { ...red, status: "held" } }), { ok: false, reason: "not_confirmed" });
  assert.deepEqual(plan({ redemption: { ...red, priorConfirmedCount: 2 } }), { ok: false, reason: "not_first" });
  assert.deepEqual(plan({ referrerCustomerId: "new1" }), { ok: false, reason: "self_referral" });
  assert.deepEqual(plan({ referrerCustomerId: null }), { ok: false, reason: "no_referrer" });
  assert.deepEqual(plan({ redemption: { ...red, referredCustomerId: null } }), { ok: false, reason: "no_referred" });
});
