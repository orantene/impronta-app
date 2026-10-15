/**
 * Promos v1, booking: a guest books on the hub with a live auto promo, then
 * with a typed code, through the real sheet and the real instant-book server
 * action. The pay-in-person path (no online collect) keeps Stripe out of it.
 *
 * Asserted per booking:
 *   orders.discount_cents                        the discount the sheet showed
 *   tenant_promo_redemptions.status = confirmed  hold -> confirm happened
 *   redemption snapshots                         list_cents, discount_cents, source
 *
 * REFUND. The full-refund executor (src/lib/orders/refund-execute-lines.ts)
 * moves money through Stripe, and the local lane has no Stripe. So:
 *   - the DB leg is covered: `promo_void`, the RPC `applyRefund` calls for a
 *     full refund, keeps the row ('voided' + voided_at, never deleted);
 *   - the end-to-end refund test below is skipped, named, with the reason.
 *
 * Fixture: t_max (talent_portfolio, so instant booking is allowed). The promos
 * are seeded under the E2E prefix and removed in afterAll; booking hours are
 * seeded only if t_max has none and removed again.
 */
import { expect, test } from "@playwright/test";

import { talentFixture } from "../talent-website/fixtures";
import { talentProfileIdFor } from "../talent-website/helpers";
import {
  adminDb,
  PROMO_PREFIX,
  cleanupPromos,
  ensureBookingHoursIfMissing,
  promoTenantId,
  redemptionsFor,
  removeBookingHours,
  rpcVerdict,
  seedPromo,
  type RedemptionRow,
} from "./_db";
import {
  advanceToWho,
  applyTypedCode,
  confirmBooking,
  expectFooterTotal,
  fillWho,
  orderForGuest,
} from "./_sheet";

const fx = talentFixture("t_max");
const CODE = "E2ECODE10";
const run = Date.now();
const SPEC_PREFIX = `${PROMO_PREFIX} booking`;

test.describe.configure({ mode: "serial" });

let tenantId = "";
let profileId = "";
let autoPromoId = "";
let codePromoId = "";
let createdHours = false;
/** The confirmed redemption from the auto-promo booking, reused by the void test. */
let autoRedemption: RedemptionRow | null = null;

async function confirmedRedemption(orderId: string, promoId: string): Promise<RedemptionRow> {
  const out: { row: RedemptionRow | null } = { row: null };
  await expect
    .poll(
      async () => {
        const rows = await redemptionsFor(adminDb(), promoId);
        out.row = rows.find((r) => r.order_id === orderId) ?? null;
        return out.row?.status ?? "none";
      },
      { timeout: 30_000, intervals: [1_000, 2_000], message: `redemption for order ${orderId} never became confirmed` },
    )
    .toBe("confirmed");
  if (!out.row) throw new Error("redemption row missing");
  return out.row;
}

test.beforeAll(async () => {
  const db = adminDb();
  profileId = talentProfileIdFor("t_max");
  tenantId = await promoTenantId(db, profileId);
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  createdHours = await ensureBookingHoursIfMissing(db, profileId, tenantId);
  autoPromoId = await seedPromo(db, tenantId, { name: "booking auto 20", unlock: "auto", percent: 20, showOnSite: true });
  codePromoId = await seedPromo(db, tenantId, { name: "booking code 10", unlock: "code", code: CODE, percent: 10 });
});

test.afterAll(async () => {
  if (!tenantId) return;
  const db = adminDb();
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  if (createdHours) await removeBookingHours(db, profileId);
});

test("guest books on the hub with the auto promo: order carries the discount, redemption is confirmed", async ({ page }) => {
  test.setTimeout(240_000);
  const email = `promo-auto-${run}@impronta.test`;

  await page.goto(`/t/${fx.profileCode}#book`, { waitUntil: "domcontentloaded" });
  const list = await advanceToWho(page);
  expect(list, "the sheet must show a list price to price against").not.toBeNull();
  if (list === null) return;
  const discount = Math.round(list * 0.2);
  await fillWho(page, { name: "Promo Auto Guest", email });
  await expectFooterTotal(page, list - discount);

  await confirmBooking(page);

  const order = await orderForGuest(adminDb(), tenantId, email);
  expect(order.discount_cents, "orders.discount_cents is the promo's discount").toBe(discount);

  const row = await confirmedRedemption(order.id, autoPromoId);
  expect(row.discount_cents).toBe(discount);
  expect(row.list_cents).toBe(list);
  expect(row.source).toBe("auto");
  expect(row.source_channel).toBe("site");
  expect(row.hold_expires_at, "a confirmed use has no hold expiry").toBeNull();
  autoRedemption = row;
});

test("a typed code prices the booking and confirms its own redemption", async ({ page }) => {
  test.setTimeout(240_000);
  const db = adminDb();
  // One price promo per line: take the auto promo out of the way so the code is what applies.
  const { error } = await db.from("tenant_promo_codes").update({ is_paused: true }).eq("id", autoPromoId);
  if (error) throw new Error(error.message);
  const email = `promo-code-${run}@impronta.test`;

  await page.goto(`/t/${fx.profileCode}#book`, { waitUntil: "domcontentloaded" });
  const list = await advanceToWho(page);
  expect(list, "the sheet must show a list price to price against").not.toBeNull();
  if (list === null) return;
  const discount = Math.round(list * 0.1);
  await fillWho(page, { name: "Promo Code Guest", email });
  await applyTypedCode(page, CODE);
  await expectFooterTotal(page, list - discount);

  await confirmBooking(page);

  const order = await orderForGuest(db, tenantId, email);
  expect(order.discount_cents).toBe(discount);
  const row = await confirmedRedemption(order.id, codePromoId);
  expect(row.discount_cents).toBe(discount);
  expect(row.list_cents).toBe(list);
  expect(row.source).toBe("code");
  expect(row.source_channel).toBe("code");
});

test("full refund, DB leg: promo_void keeps the row as 'voided' with voided_at", async () => {
  expect(autoRedemption, "depends on the auto-promo booking above").not.toBeNull();
  if (!autoRedemption) return;
  const db = adminDb();

  const first = await rpcVerdict(db, "promo_void", { p_redemption_id: autoRedemption.id });
  expect(first).toMatchObject({ ok: true, already: false });

  const rows = await redemptionsFor(db, autoPromoId);
  const row = rows.find((r) => r.id === autoRedemption?.id);
  expect(row, "a voided use is history: the row must still exist").toBeTruthy();
  expect(row?.status).toBe("voided");
  expect(row?.voided_at, "voided_at is stamped").not.toBeNull();
  expect(row?.discount_cents, "the discount snapshot survives for the audit trail").toBe(autoRedemption.discount_cents);

  const again = await rpcVerdict(db, "promo_void", { p_redemption_id: autoRedemption.id });
  expect(again, "voiding twice is idempotent").toMatchObject({ ok: true, already: true });
});

// SKIPPED ON PURPOSE: refund-execute-lines.ts refunds through Stripe, and the
// local Supabase lane has no Stripe (no keys, no webhook). Booking pay-in-person
// leaves nothing to refund, so there is no Stripe-free way to reach the
// executor. Covered instead by the promo_void DB leg above and the unit tests
// around applyRefund / refund-execute-lines. Enable when a Stripe test-mode
// lane exists: pay the order online, run the desk refund, assert voided_at.
test.skip("full refund through the refund executor voids the redemption (needs Stripe test mode)", async () => {
  // Intentionally empty. See the comment above for why this cannot run locally.
});
