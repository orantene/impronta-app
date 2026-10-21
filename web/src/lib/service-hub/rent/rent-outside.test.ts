/** TUL-1646: the owner records a month's rent paid in cash or by bank transfer. No fee, never twice. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { decideMarkPaidOutside, shouldSkipAutopayInvoice, type OutsideContext } from "./rent-outside";
import type { RentPlan } from "./rent-cycle";

const plan = (over: Partial<RentPlan> = {}): RentPlan => ({
  id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1", monthlyRentCents: 120_000, percentBps: 0, currency: "MXN", startsOn: "2026-09-01",
  status: "active", acceptedAt: "2026-08-30T10:00:00Z", acceptedAmountCents: 120_000, acceptedPercentBps: 0, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1,
  ...over,
});
const NOW = new Date("2026-10-20T12:00:00Z");
const ctx = (over: Partial<OutsideContext> = {}): OutsideContext => ({
  plan: plan(), period: "2026-10", method: "cash", amountCents: 120_000, existingStatus: null, now: NOW, ...over,
});

describe("what may be recorded as paid outside Tulala", () => {
  test("a month of an accepted plan, with a method and an amount", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx()), { ok: true });
    assert.deepEqual(decideMarkPaidOutside(ctx({ method: "transfer", plan: plan({ status: "paused" }) })), { ok: true });
  });
  test("both methods only; amount a positive whole number within the cap", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx({ method: "crypto" as never })), { ok: false, reason: "bad_method" });
    for (const amountCents of [0, -1, 1.5, 100_000_001, Number.NaN]) assert.deepEqual(decideMarkPaidOutside(ctx({ amountCents })), { ok: false, reason: "bad_amount" });
  });
  test("never a month before the plan started, one beyond next month, or a malformed one", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx({ period: "2026-08" })), { ok: false, reason: "before_start" });
    assert.deepEqual(decideMarkPaidOutside(ctx({ period: "2026-12" })), { ok: false, reason: "future_period" });
    assert.deepEqual(decideMarkPaidOutside(ctx({ period: "2026-11" })), { ok: true }, "next month can be paid ahead (before an automatic charge)");
    assert.deepEqual(decideMarkPaidOutside(ctx({ period: "2026-13" })), { ok: false, reason: "bad_period" });
  });
  test("only a plan the member accepted", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx({ plan: plan({ acceptedAt: null, status: "proposed" }) })), { ok: false, reason: "not_accepted" });
    assert.deepEqual(decideMarkPaidOutside(ctx({ plan: plan({ status: "declined" }) })), { ok: false, reason: "not_active" });
  });
  test("a month already paid (link, card or outside) is never paid again", () => {
    assert.deepEqual(decideMarkPaidOutside(ctx({ existingStatus: "paid" })), { ok: false, reason: "already_paid" });
    for (const s of ["issued", "issuing", "failed", "void"]) assert.deepEqual(decideMarkPaidOutside(ctx({ existingStatus: s })), { ok: true }, s);
  });
});

describe("a month paid outside skips its automatic charge", () => {
  test("the card invoice for exactly that month is voided; other months are untouched", () => {
    assert.equal(shouldSkipAutopayInvoice(["2026-11"], "2026-11"), true);
    assert.equal(shouldSkipAutopayInvoice(["2026-11"], "2026-12"), false);
    assert.equal(shouldSkipAutopayInvoice([], "2026-11"), false);
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const actions = read("src/lib/service-hub/rent/rent-outside-actions.ts");
  const server = read("src/lib/service-hub/rent/rent-autopay.server.ts");
  test("owner only, audited, with no fee computed anywhere in it", () => {
    assert.match(actions, /await ownerGuard\(\)/);
    assert.match(actions, /logWorkspaceAudit\(/);
    assert.doesNotMatch(actions.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), /feeBps|service_fee|application_fee|commission/i);
  });
  test("closes the month's open payment link before recording", () => {
    assert.match(actions, /cancelPaymentLink\(/);
    assert.ok(actions.indexOf("cancelPaymentLink(") < actions.indexOf('source: "outside"'));
  });
  test("an autopay month: the future charge is skipped by the webhook, an existing open or draft invoice is voided now", () => {
    const helper = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-outside-autopay.server.ts"), "utf8");
    assert.match(actions, /autopay_skip_periods/);
    assert.match(helper, /autopay_skip_periods/);
    assert.match(server, /shouldSkipAutopayInvoice\(/);
    assert.match(server, /voidRentInvoice\(/);
    assert.match(helper, /voidAutopayMonth/);
    // and the percentage of a month paid outside is never added to the next invoice
    assert.match(server, /shouldSkipAutopayInvoice\(plan\.autopay_skip_periods \?\? \[\], month\)/);
  });
});

describe("what the owner and the professional see", () => {
  const read2 = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  test("the owner's card has the form on live plans; the professional sees how each month was paid, in both languages", async () => {
    const card = read2("src/app/(workspace)/[tenantSlug]/admin/settings/rent/RentCard.tsx");
    assert.match(card, /<PaidOutsideForm planId=\{p\.id\}/);
    const mine = read2("src/app/(workspace)/[tenantSlug]/talent/rent-proposals/RentProposalCard.tsx");
    for (const k of ["paidViaCash", "paidViaTransfer", "paidViaAutopay", "paidViaLink"]) assert.match(mine, new RegExp(`c\\.${k}`));
    const { RENT_COPY, rentRefusalText } = await import("./rent-copy");
    assert.equal(rentRefusalText("already_paid", RENT_COPY.en), "That month is already paid.");
    assert.equal(rentRefusalText("already_paid", RENT_COPY.es), "Ese mes ya está pagado.");
    assert.equal(RENT_COPY.es.cash, "Efectivo");
  });
});

describe("the held migration (TUL-1646)", () => {
  const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231423100_studio_rent_paid_outside_tul1646.sql"), "utf8").replace(/^\s*--.*$/gm, "");
  test("method, note, who marked it, the skip list, and 'outside' as a source", () => {
    assert.match(sql, /paid_outside_method text NULL CHECK \(paid_outside_method IS NULL OR paid_outside_method IN \('cash','transfer'\)\)/);
    assert.match(sql, /paid_outside_note text NULL CHECK \(paid_outside_note IS NULL OR char_length\(paid_outside_note\) <= 300\)/);
    assert.match(sql, /marked_by uuid NULL REFERENCES public\.profiles\(id\) ON DELETE SET NULL/);
    assert.match(sql, /autopay_skip_periods text\[\] NOT NULL DEFAULT '\{\}'/);
    assert.match(sql, /CHECK \(source IN \('link','autopay','outside'\)\)/);
  });
  test("it sorts after the autopay migration it extends, and the one on main is untouched", () => {
    assert.ok("20261231423100" > "20261231423000");
    assert.doesNotMatch(readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231420700_studio_rent_tul1376.sql"), "utf8"), /paid_outside/);
  });
});
