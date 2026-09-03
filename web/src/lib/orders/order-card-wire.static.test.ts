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

test("no renderer RE-PROJECTS messages and drops the order on the way", () => {
  // The fifth hop, and the one both earlier versions of this guard missed.
  //
  // `admin-4.tsx` builds a local array with its OWN inline message type and
  // projects the thread's messages into it. A field added to ThreadMessage does
  // not reach the renderer unless it is added there too — and this sits BETWEEN
  // the two places the guard was looking, so checking the bridge and the call
  // site both passed while the card had no order.
  //
  // tsc caught it, which is the honest account: this assertion exists so the
  // next field does not need a 17-minute CI round trip to find the same hop.
  for (const rel of [
    "components/admin/shell/internal/messages/admin-4.tsx",
    "components/admin/shell/internal/messages/admin-4b.tsx",
  ]) {
    const body = read(rel);
    if (!/\bid: m\.id,/.test(body)) continue; // no local projection in this file

    // COUNT, do not match. `order: m.order` also appears at the render call
    // site, so a bare match passes while the projection drops it — which is
    // exactly what the first version of this assertion did: it went green with
    // the hop deliberately broken. A file that both projects and renders needs
    // the field in BOTH places.
    const occurrences = (body.match(/order:\s*m\.order/g) ?? []).length;
    assert.ok(
      occurrences >= 2,
      `${rel} re-projects messages AND renders a card, so \`order: m.order\` must appear in both `
        + `the projection and the render ctx — found ${occurrences}`,
    );

    // And the projection's own inline type must declare it, or a dropped field
    // is invisible to tsc: an OPTIONAL property missing from an object literal
    // is not an error, which is why this needs a guard rather than a compiler.
    assert.match(
      body,
      /order\?:\s*\{/,
      `${rel}'s local message type must declare \`order\``,
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
