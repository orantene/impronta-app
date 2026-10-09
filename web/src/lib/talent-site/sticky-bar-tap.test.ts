/**
 * Grokbot P-4/P-6 + TUL-516 W3-4: sticky bar opens booking/services, never chat,
 * never a next-free slot (step 2 with a service preselected).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { OfferingRequestDetail } from "@/lib/talent/offering-request-detail";
import type { BookEntry } from "./book-entry";
import { runStickyBarTap, stickyBarAction, stickyBarIntent } from "./sticky-bar-tap";
import type { OpenIntent } from "./open-intent-queue";

const detail = { offeringId: "0b9f0c3e-5d2a-4f6e-8a1b-3c4d5e6f7a8b" } as unknown as OfferingRequestDetail;
const sheet: BookEntry = { kind: "sheet", offeringId: detail.offeringId, eventName: "tulala:offering-instant", detail };

test("count to action: only a single bookable service opens the sheet", () => {
  assert.equal(stickyBarAction(0), "scroll");
  assert.equal(stickyBarAction(1), "open-sheet");
  assert.equal(stickyBarAction(2), "scroll");
  assert.equal(stickyBarAction(9), "scroll");
});

test("intents: sheet event for one service, none otherwise", () => {
  assert.deepEqual(stickyBarIntent("open-sheet", sheet), {
    channel: "sheet",
    eventName: "tulala:offering-instant",
    detail,
  });
  assert.equal(stickyBarIntent("scroll", sheet), null);
  assert.equal(stickyBarIntent("open-sheet", { kind: "inquire" }), null);
});

function run(over: Partial<Parameters<typeof runStickyBarTap>[0]>) {
  const requested: OpenIntent[] = [];
  let scrolled = 0;
  const result = runStickyBarTap({
    menuInView: false,
    bookableCount: 1,
    entry: sheet,
    request: (i) => requested.push(i),
    scroll: () => {
      scrolled += 1;
    },
    ...over,
  });
  return { result, requested, scrolled };
}

test("one bookable service: opens the sheet, does NOT scroll", () => {
  const r = run({});
  assert.equal(r.result, "open-sheet");
  assert.equal(r.scrolled, 0);
  assert.equal(r.requested.length, 1);
  assert.equal(r.requested[0]?.channel, "sheet");
});

test("several bookable services: scrolls to the menu (Elige tu servicio), never chat", () => {
  const r = run({ bookableCount: 3, entry: sheet });
  assert.equal(r.result, "scroll");
  assert.equal(r.scrolled, 1);
  assert.equal(r.requested.length, 0);
});

test("no bookable service: scrolls (never opens chat)", () => {
  const r = run({ bookableCount: 0, entry: { kind: "inquire" } });
  assert.equal(r.result, "scroll");
  assert.equal(r.scrolled, 1);
  assert.equal(r.requested.length, 0);
});

test("menu in view always scrolls; never opens a next-free slot path", () => {
  const b = run({ menuInView: true });
  assert.equal(b.result, "scroll");
  assert.equal(b.scrolled, 1);
  assert.equal(b.requested.length, 0);
  const bar = readFileSync("src/lib/talent-site/sticky-bar-tap.ts", "utf8");
  assert.doesNotMatch(bar, /openAtSlot|open-at-slot|NextSlot/);
});

test("wiring: both bar styles use the shared tap through the open-intent queue", () => {
  const bar = readFileSync("src/lib/site-admin/builder-node/services-catalog-idle-bar.tsx", "utf8");
  assert.match(bar, /runStickyBarTap/);
  assert.match(bar, /request: requestTalentOpen/);
  assert.match(bar, /export function CatalogIdleBarText/);
  const filter = readFileSync("src/lib/site-admin/builder-node/services-catalog-filter.tsx", "utf8");
  assert.match(filter, /<CatalogIdleBarText/);
  assert.doesNotMatch(filter, /className="cb-bar-text"/);
});
