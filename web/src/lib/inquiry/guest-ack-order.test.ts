import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A client must never read a transcript in which they thanked themselves.
 *
 * Measured on a live inquiry (e517f59f, improntamodels.com, 02:40:55Z):
 *
 *   02:40:55.091  "Thanks, we'll get back to you soon"    text, no author
 *   02:40:55.139  the guest's own first message           48 ms LATER
 *   02:40:56.074  "Got it — we've received your message"  system_event
 *
 * Two acknowledgements for one inquiry, and the first landed BEFORE the message
 * it acknowledged. The cause is not a wrong `created_at`: the engine's ack sits
 * in a `void` fire-and-forget IIFE, so it races the caller, and on the guest
 * path the caller writes the guest's own message afterwards behind another
 * round-trip. The ack wins every time.
 *
 * Source assertions: the race is between two awaits in different modules, and
 * there is no fixture that reproduces a race. What CAN be pinned is that the
 * engine no longer fires on the guest path, that the guest path emits after the
 * message, and that the tenant's copy still reaches the one remaining ack.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");
const engine = readFileSync(join(SRC, "lib/inquiry/inquiry-engine-submit.ts"), "utf8");
const guest = readFileSync(
  join(SRC, "app/t/[profileCode]/_actions/guest-chat-actions.ts"),
  "utf8",
);

test("the engine's auto-ack does not fire on the guest path", () => {
  // Asserted as the RULE, not the shape. The first version pinned a named
  // const that was later inlined to keep the file under its 800-line cap — a
  // correct change that reddened a test measuring how the rule was spelled.
  assert.match(
    engine,
    /if \(!input\.guest_session_id && autoAckEnabled/,
    "the ack must be gated on the guest path, or it races the guest's message again",
  );
});

test("the guest's message is written BEFORE the ack is emitted", () => {
  // The whole defect in one assertion. These are two awaits in one function and
  // their order is the fix; a refactor that moves the ack above the send
  // reintroduces a client thanking themselves.
  const send = guest.indexOf("const sent = await sendMessage(admin, {");
  const ack = guest.indexOf("const emittedAutoAck = await emitGuestAutoAck({");
  assert.ok(send > 0 && ack > 0, "one of the two calls is missing");
  assert.ok(send < ack, "the ack is emitted before the guest's own message");
});

test("the tenant's configured copy reaches the ack that survives", () => {
  // Removing the engine's ack must not silently replace a tenant's own sentence
  // with the generic body. `emitGuestAutoAck` has taken these arguments since it
  // shipped and nothing ever passed them.
  assert.match(guest, /customAckMessage:/, "the tenant's copy is dropped");
  assert.match(guest, /autoAckEnabled: ackSettings == null \? true :/, "a null row must mean enabled");
  assert.match(guest, /auto_ack_enabled, auto_ack_message/, "the settings are never read");
});

test("a tenant that never opened the setting still acknowledges its guests", () => {
  // The engine treated a null agency row as enabled. If this path treated it as
  // disabled, turning the race off would silently stop acknowledging every
  // tenant that has never touched the screen — a worse bug, and an invisible one.
  assert.match(engine, /agencyRow == null \? true : agencyRow\.auto_ack_enabled !== false/);
  assert.match(guest, /ackSettings == null \? true : ackSettings\.auto_ack_enabled !== false/);
});
