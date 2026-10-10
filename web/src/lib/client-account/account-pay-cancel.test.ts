import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { formatZonedWhen, owedCents, pickClientBooking } from "./area-pure";

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

test("/c/<id> keeps a signed-in client on the inquiry's own agency host when the account is on there", () => {
  const page = read("src/app/c/[inquiryId]/page.tsx");
  const agencyBranch = page.slice(page.indexOf('hostCtx.kind === "agency"'), page.indexOf("if (!onTalentSite)"));
  assert.match(agencyBranch, /hostCtx\.tenantSlug === clientRedirect\.tenantSlug/);
  assert.match(agencyBranch, /clientAccountEnabledFor\("agency"\)[\s\S]{0,40}redirect\(`\/account\/visits\/\$\{encodeURIComponent\(inquiryId\)\}`\)/);
});

test("/account button styles come from a plain module (a client-module object is empty on the server)", () => {
  const view = read("src/components/client-account/ClientAccountArea.tsx");
  assert.match(view, /import \{ btnPrimary \} from "\.\/account-button-styles"/);
  assert.doesNotMatch(read("src/components/client-account/account-button-styles.ts"), /^["']use client["']/m);
});

test("pickClientBooking: the client's own open booking beats a newer draft without a client", () => {
  const rows = [
    { id: "draft", client_user_id: null, status: "draft" },
    { id: "old-cancelled", client_user_id: "u1", status: "cancelled" },
    { id: "mine", client_user_id: "u1", status: "confirmed" },
  ];
  assert.equal(pickClientBooking(rows, "u1")?.id, "mine");
  assert.equal(pickClientBooking(rows.slice(0, 2), "u1")?.id, "old-cancelled");
  assert.equal(pickClientBooking(rows.slice(0, 1), "u1")?.id, "draft");
  assert.equal(pickClientBooking([], "u1"), null);
});

test("Pagos reads owed bookings without a SQL status filter (non-enum values made Postgres reject it)", () => {
  const data = read("src/lib/client-account/area-data.server.ts");
  const owed = data.slice(data.indexOf("export async function loadOwedPayLinks"));
  assert.doesNotMatch(owed, /\.not\("status", "in"/);
  assert.match(owed, /CLOSED_BOOKING_STATUSES as readonly string\[\]\)\.includes/);
});

test("a request with no booking yet shows the picked slot and service from its reservation stamp", () => {
  const data = read("src/lib/client-account/area-data.server.ts");
  assert.match(data, /parseReservationStamp\(i\.source_context\)/);
  assert.match(data, /startsAt: b\?\.starts_at \?\? \(b \? null : stamp\?\.starts_at \?\? null\)/);
  const w = formatZonedWhen("2026-10-13", "America/Mexico_City", "es");
  assert.equal(w?.time, "");
  assert.match(w?.date ?? "", /13 de octubre/);
});

test("the public booking drawer's follow-up link stays on the site (/c/<id>)", () => {
  const view = read("src/components/inquiry/InquirySubmittedView.tsx");
  assert.match(view, /followUpOnSite\s*\?\s*`\/c\/\$\{encodeURIComponent\(state\.inquiryId\)\}`/);
  assert.match(read("src/components/public-booking/BookableComposer.tsx"), /\n\s*followUpOnSite\n/);
});

test("payMyBookingForm runs the impersonation guard before anything else", () => {
  const src = read("src/lib/client-account/booking-actions.ts");
  const form = src.slice(src.indexOf("export async function payMyBookingForm"));
  assert.match(form, /^export async function payMyBookingForm[^\n]*\n\s*if \(!\(await assertNotImpersonating\(\)\)\.ok\)/);
});
