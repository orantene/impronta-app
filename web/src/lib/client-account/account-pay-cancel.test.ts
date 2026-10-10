import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { owedCents } from "./area-pure";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("owedCents: price less ledger-paid, nothing for closed, paid or unpriced bookings", () => {
  assert.equal(owedCents({ bookingStatus: "confirmed", paymentStatus: "unpaid", amountCents: 100_000, paidCents: 0 }), 100_000);
  assert.equal(owedCents({ bookingStatus: "confirmed", paymentStatus: "partial", amountCents: 100_000, paidCents: 30_000 }), 70_000);
  assert.equal(owedCents({ bookingStatus: "cancelled", paymentStatus: "unpaid", amountCents: 100_000, paidCents: 0 }), 0);
  assert.equal(owedCents({ bookingStatus: "confirmed", paymentStatus: "paid", amountCents: 100_000, paidCents: 100_000 }), 0);
  assert.equal(owedCents({ bookingStatus: "confirmed", paymentStatus: "unpaid", amountCents: null, paidCents: 0 }), 0);
  assert.equal(owedCents({ bookingStatus: "confirmed", paymentStatus: "partial", amountCents: 50_000, paidCents: 80_000 }), 0);
});

test("client cancel voids the order and takes down pay links (TUL-62)", () => {
  const src = read("src/lib/client-account/booking-actions.ts");
  const cancel = src.slice(src.indexOf("export async function cancelMyBooking"), src.indexOf("export async function rescheduleMyBooking"));
  assert.match(cancel, /settleMoneyOnCancel\(g\.admin, \{ tenantId: g\.tenantId, orderId: g\.orderId \}/);
  assert.match(src, /\.select\("id, tenant_id, client_user_id, status, starts_at, order_id"\)/);
});

test("client pay action: amount and order from the database, guarded, minted through createPaymentLink", () => {
  const src = read("src/lib/client-account/booking-actions.ts");
  const pay = src.slice(src.indexOf("async function payMyBooking("));
  assert.match(pay, /^async function payMyBooking[^\n]*\n\s*if \(!\(await assertNotImpersonating\(\)\)\.ok\)/);
  assert.match(pay, /\.eq\("tenant_id", tenant\.tenantId\)/);
  assert.match(pay, /ledgerPaidCents\(admin, b\.order_id\)/);
  assert.match(pay, /amountCents: owed,/);
  assert.doesNotMatch(pay, /formData\.get\("amount/);
});

test("/account offers Pagar when a balance has no open link yet", () => {
  const view = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(view, /<form action=\{payMyBookingForm\}/);
  assert.match(view, /v\.canPay && v\.bookingId/);
  const data = read("src/lib/client-account/area-data.server.ts");
  assert.match(data, /code: byOrder\.get\(r\.order_id\) \?\? null, bookingId: r\.id/);
});

test("/c/<id> keeps a signed-in client on the talent site after booking (TUL-62)", () => {
  const page = read("src/app/c/[inquiryId]/page.tsx");
  const talentBranch = page.slice(page.indexOf("if (!onTalentSite)"));
  assert.match(talentBranch, /clientAccountEnabledFor\("talent"\)[\s\S]{0,40}redirect\(`\/account\/visits\/\$\{encodeURIComponent\(inquiryId\)\}`\)/);
});
