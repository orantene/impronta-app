import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Every path that mints a ticket a guest paid for (or was given) must also
 * send it. These greps are the pin: a refactor that drops a hook fails here,
 * not at a door.
 */
const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

test("the Stripe-paid, counter and door-settle paths mint AND deliver", () => {
  assert.match(src("lib/bookings/transactions.ts"), /mintAndDeliverForPaidOrder\(sbOrders, ctx\)/);
  assert.match(src("app/(workspace)/[tenantSlug]/admin/pos/actions.ts"), /mintAndDeliverForPaidOrder\(g\.admin, \{/);
  assert.match(src("app/(workspace)/[tenantSlug]/admin/_door-actions.ts"), /onOrderPaid: \(ctx\) => mintAndDeliverForPaidOrder\(admin, ctx\)/);
});

test("the $0 web order delivers in the buyer's locale after the holder stamp", () => {
  const s = src("app/(public)/_events/ticket-picker-actions.ts");
  assert.match(s, /deliverTicketsForOrder\(admin, \{ tenantId: d\.tenantId, orderId: result\.orderId, locale: d\.locale \?\? null \}\)/);
  assert.ok(s.indexOf("events.buy.compHolder") < s.indexOf("deliverTicketsForOrder(admin"), "after the holder is stamped");
});

test("a comp with an e-mail delivers; resend and the Delivery sheet reuse the same mail", () => {
  assert.match(src("lib/server-actions/venue-engine.ts"), /deliverTicketForAdmission\(g\.admin, \{ tenantId: g\.tenantId, admissionId: res\.id/);
  assert.match(src("lib/venues/ticket-self.ts"), /deliverTicketForAdmission\(admin, \{\s*tenantId: input\.tenantId,\s*admissionId: loaded\.admissionId,\s*force: true/);
  assert.match(src("lib/venues/event-holds.ts"), /deliverTicketForAdmission\(admin, \{\s*tenantId: input\.tenantId,\s*admissionId: input\.admissionId,\s*force: true/);
  for (const f of ["lib/venues/ticket-self.ts", "lib/venues/event-holds.ts"]) {
    assert.doesNotMatch(src(f), /subject: "Your ticket"/, `${f} still carries the stub`);
  }
});

test("the QR image route is public, host-scoped, version-checked and rate-limited", () => {
  const s = src("app/api/tickets/[code]/qr/route.ts");
  assert.match(s, /getPublicHostContext\(\)/);
  assert.match(s, /verifyAdmissionToken\(token\)/);
  assert.match(s, /row\.token_version !== verified\.tokenVersion/);
  assert.match(s, /tryConsumeRateLimit\(`ticket-qr:/);
  assert.match(src("lib/saas/gate.ts"), /CANONICAL_TICKET_API_PREFIX\)\) return kind === "agency" \|\| kind === "hub"/);
});
