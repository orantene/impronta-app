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
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

test("layer 1 — EVERY producer of a card-bearing message attaches the order", () => {
  // The first version of this test named ONE loader and passed while the page
  // rendered a blank card, because TWO loaders build messages: the per-thread
  // one and the inbox-list one that feeds the shell's first paint. A guard that
  // names a file measures that file, not the code path that runs.
  //
  // So find the producers instead of naming them: any site that constructs a
  // message object with `card_payload:` must also set `order:`.
  const dir = path.join(SRC, "app/(workspace)/[tenantSlug]/_data-bridge");
  const producers: string[] = [];

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    const body = readFileSync(path.join(dir, entry), "utf8");
    // `card_payload: row.card_payload` is the construction shape; a bare
    // `card_payload?:` in a type declaration is not.
    if (/card_payload:\s*row\.card_payload/.test(body)) producers.push(entry);
  }

  assert.ok(producers.length >= 2, `expected at least 2 message producers, found ${producers.join(", ")}`);

  for (const entry of producers) {
    const body = readFileSync(path.join(dir, entry), "utf8");
    assert.match(
      body,
      /order:\s*\n?\s*row\.message_kind === "order"/,
      `${entry} builds messages with card_payload but never sets \`order\` — an order card there ` +
        `renders its neutral "no longer available" state on a real page while every unit test passes`,
    );
    assert.match(body, /loadOrdersForThread/, `${entry} must read the orders it attaches`);
  }
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
