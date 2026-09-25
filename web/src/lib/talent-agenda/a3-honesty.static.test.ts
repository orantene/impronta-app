/**
 * A3.1 — Static honesty contracts (source reads; complements a3-honesty.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

describe("A3 static — booking writers + cancel path", () => {
  const bookingActions = readFileSync(path.join(ROOT, "booking-actions.ts"), "utf8");
  const cancelActions = readFileSync(path.join(ROOT, "cancel-actions.ts"), "utf8");

  it("booking-actions writers call requireOwnBooking and propagate unauthorized", () => {
    const writers = [
      "markBookingNoShow",
      "completeBooking",
      "recordBookingCashCollected",
      "recordBookingTransferAwaiting",
      "markBookingTransferReceived",
      "createAgendaBookingPayLink",
    ];
    for (const name of writers) {
      const fnStart = bookingActions.indexOf(`export async function ${name}`);
      assert.ok(fnStart >= 0, `${name} missing`);
      const head = bookingActions.slice(fnStart, fnStart + 500);
      assert.match(head, /const own = await requireOwnBooking\(input\.bookingId\)/);
      assert.match(head, /if \(!own\.ok\) return own;/);
    }
    assert.match(bookingActions, /ownBookingGate/);
    assert.match(bookingActions, /talentBookingMirrorEq/);
  });

  it("talent_bookings mirror updates never filter by starts_at window", () => {
    assert.doesNotMatch(bookingActions, /from\("talent_bookings"\)[\s\S]*?gte\("starts_at"/);
    assert.match(bookingActions, /talentBookingMirrorEq/);
  });

  it("card pay link shells order — no no_order reason", () => {
    assert.match(bookingActions, /ensureAgendaOrderShell/);
    assert.doesNotMatch(bookingActions, /reason:\s*"no_order"/);
  });

  it("cancel-actions uses requireOwnBooking, not staff cancelBookingSetAction", () => {
    assert.match(cancelActions, /requireOwnBooking/);
    assert.match(cancelActions, /cancelBookingSet/);
    assert.doesNotMatch(cancelActions, /cancelBookingSetAction/);
  });
});
