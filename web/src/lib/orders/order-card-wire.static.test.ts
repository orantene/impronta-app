/**
 * The order card is wired at ALL FOUR layers.
 *
 * AGENTS.md: "a capability wired at 3 of 4 layers is this repo's most-repeated
 * defect." The order card has exactly that shape — a card that renders
 * perfectly in isolation and shows nothing in a real thread because one hop
 * does not forward the data. Every individual layer's own tests still pass.
 *
 * The four hops:
 *   1. the loader READS the order          (_data-bridge/inquiry-thread-messages)
 *   2. the payload TYPE carries it         (_data-bridge/inquiries-messages)
 *   3. the shell adapter FORWARDS it       (shell/internal/state/context)
 *   4. the render call sites PASS it       (messages/admin-4, admin-4b)
 *
 * A source scan, so it is a tripwire rather than a proof — but the failure it
 * catches is silent, and silence is what makes this defect recur.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

test("layer 1 — the thread loader reads orders and attaches them", () => {
  const s = read("app/(workspace)/[tenantSlug]/_data-bridge/inquiry-thread-messages.ts");
  assert.match(s, /loadOrdersForThread/, "loader must read the orders");
  assert.match(s, /orderIdsFromMessages/, "loader must collect ids from card payloads");
  assert.match(s, /order:\s*$|order:/m, "loader must attach `order` to the message");
});

test("layer 2 — the message type carries the order", () => {
  const s = read("app/(workspace)/[tenantSlug]/_data-bridge/inquiries-messages.ts");
  assert.match(s, /order\?:\s*\{/, "WorkspaceMessage must declare `order`");
  assert.match(s, /outstandingCents/, "the order shape must include what is outstanding");
});

test("layer 3 — the shell adapter forwards it", () => {
  const s = read("components/admin/shell/internal/state/context.tsx");
  assert.match(s, /order:\s*message\.order/, "the adapter must forward message.order");
});

test("layer 4 — every render call site passes it", () => {
  for (const rel of [
    "components/admin/shell/internal/messages/admin-4.tsx",
    "components/admin/shell/internal/messages/admin-4b.tsx",
  ]) {
    const s = read(rel);
    assert.match(s, /renderChatCardForMessage/, `${rel} should render cards`);
    assert.match(
      s,
      /order:\s*m\.order/,
      `${rel} calls renderChatCardForMessage but does NOT pass \`order\` — the card will render its ` +
        `neutral "no longer available" state in a real thread while every unit test passes`,
    );
  }
});

test("the renderer accepts an order and derives the view rather than reading a label", () => {
  const s = read("components/admin/shell/internal/messages/admin-3.tsx");
  assert.match(s, /case "order":/, "the renderer must handle the 'order' kind");
  assert.match(s, /orderCardView/, "it must DERIVE the view");
  // The whole design: no figure comes out of the payload.
  assert.doesNotMatch(
    s.slice(s.indexOf('case "order":'), s.indexOf('case "offer_event":')),
    /total_label|amount_label/,
    "the order card must not read a stored label — an order changes after its card is written",
  );
});
