import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getFeatureByKey } from "./features";

/**
 * The pricing fee table carries a banner saying ticketing is not available
 * yet. It was correct when written and it becomes FALSE the day ticketing
 * ships: a live product with a notice saying it does not exist.
 *
 * Tickets are days away, so an unconditional banner would have rotted almost
 * immediately, and the person shipping ticketing should not also have to
 * remember a sentence on the pricing page. It reads catalogue status instead.
 *
 * These tests pin the MECHANISM, not the wording, so the banner keeps
 * disappearing on its own.
 */

const COMPONENT = "src/components/marketing/ticket-fee-table.tsx";

test("the banner is gated on catalogue status, not shown unconditionally", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(
    src,
    /getFeatureByKey\("ticketing"\)\?\.status === "live"/,
    "The banner must read the catalogue. Unconditional means it keeps claiming " +
      "ticketing is unavailable after ticketing ships.",
  );
  assert.match(
    src,
    /\{ticketingLive \? null : \(/,
    "The banner must actually be gated on that flag, not merely compute it.",
  );
});

test("while ticketing is not live the banner exists in both languages", () => {
  if (getFeatureByKey("ticketing")?.status === "live") return;
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(src, /notYet:/, "English qualifier missing");
  assert.match(
    src,
    /La venta de boletos todav[ií]a no est[áa] disponible/,
    "Spanish qualifier missing, which hides the caveat from half the readers",
  );
});

test("the banner links to the ticketing feature page in the reader's language", () => {
  const src = readFileSync(COMPONENT, "utf8");
  assert.match(src, /featuresHref/, "the banner should link out to the status");
  // The ES slug is `boletos`; `/es/funciones/ticketing` only works because a
  // page-level 308 catches it. Prefer the canonical path over relying on that.
  const ticketing = getFeatureByKey("ticketing");
  assert.equal(ticketing?.slugEs, "boletos", "ES slug changed; update the link");
});
