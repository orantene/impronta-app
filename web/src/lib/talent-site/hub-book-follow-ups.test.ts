import assert from "node:assert/strict";
import { test } from "node:test";

import { intentForHref, openIntentFor, preferBookableOffering, resolveBookEntry } from "./book-entry";
import { createOpenIntentQueue, type OpenIntent } from "./open-intent-queue";
import type { TalentOffering } from "@/lib/talent/offerings-types";

const offering = (id: string, extra: Partial<TalentOffering> = {}): TalentOffering =>
  ({
    id,
    talentProfileId: "tp1",
    title: `Service ${id}`,
    kind: "service",
    bookingMode: "request",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 5000,
    currency: "USD",
    visibility: "public",
    durationMinutes: 60,
    allowPayInPerson: false,
    reserveMode: "full",
    depositPct: null,
    imageUrls: [],
    variants: [],
    addOns: [],
    attributes: {},
    description: null,
    isFeatured: false,
    sortOrder: 0,
    ...extra,
  }) as unknown as TalentOffering;

test("#book with ONE bookable offering opens that offering's sheet", () => {
  const entry = resolveBookEntry({ offerings: [offering("a")], defaults: { bookingPosture: "request" } });
  assert.equal(entry.kind, "sheet");
  if (entry.kind !== "sheet") return;
  assert.equal(entry.offeringId, "a");
  assert.equal(entry.detail.offeringId, "a");
  // The same event a tap on the card would dispatch for this service.
  assert.match(entry.eventName, /^tulala:offering-(slot|request|instant)$/);
  const intent = openIntentFor("book", entry);
  assert.deepEqual(intent, { channel: "sheet", eventName: entry.eventName, detail: entry.detail });
});

test("#book with several bookable offerings opens the preferred offering's sheet (not the dock)", () => {
  const entry = resolveBookEntry({
    offerings: [
      offering("z", { sortOrder: 20 }),
      offering("a", { sortOrder: 10 }),
      offering("m", { sortOrder: 5, isFeatured: true }),
    ],
  });
  assert.equal(entry.kind, "sheet");
  if (entry.kind !== "sheet") return;
  // Featured wins over lower sortOrder on a non-featured row.
  assert.equal(entry.offeringId, "m");
  assert.equal(openIntentFor("book", entry).channel, "sheet");
});

test("#book with several non-featured offerings picks the lowest sortOrder", () => {
  const entry = resolveBookEntry({
    offerings: [offering("b", { sortOrder: 2 }), offering("a", { sortOrder: 1 })],
  });
  assert.equal(entry.kind, "sheet");
  if (entry.kind !== "sheet") return;
  assert.equal(entry.offeringId, "a");
});

test("preferBookableOffering is stable by id when sortOrder ties", () => {
  const rows = [
    { offering: offering("b", { sortOrder: 1 }), eventName: "tulala:offering-request", detail: { offeringId: "b" } },
    { offering: offering("a", { sortOrder: 1 }), eventName: "tulala:offering-request", detail: { offeringId: "a" } },
  ];
  assert.equal(preferBookableOffering(rows as never)?.offering.id, "a");
});

test("#book with none bookable falls back to inquire (the dock / form)", () => {
  const quote = offering("q", { priceDisplay: "quote" as never, amountCents: null });
  const hidden = offering("h", { publicCtaHidden: true } as never);
  const entry = resolveBookEntry({ offerings: [quote, hidden] });
  assert.deepEqual(entry, { kind: "inquire" });
  assert.deepEqual(openIntentFor("book", entry), { channel: "chat" });
  assert.deepEqual(resolveBookEntry({ offerings: [] }), { kind: "inquire" });
});

test("a purchase-only product is not a bookable service", () => {
  const product = offering("p", { kind: "product", bookingMode: "instant", durationMinutes: null } as never);
  assert.deepEqual(resolveBookEntry({ offerings: [product, offering("a")] }).kind, "sheet");
});

test("#talent-ask always opens the chat, even with one bookable offering", () => {
  const entry = resolveBookEntry({ offerings: [offering("a")] });
  assert.deepEqual(intentForHref("#talent-ask", entry), { channel: "chat" });
  assert.equal(intentForHref("https://x.example.com/#book", entry)?.channel, "sheet");
  assert.equal(intentForHref("/about", entry), null);
});

const harness = () => {
  const sent: OpenIntent[] = [];
  let fire: (() => void) | null = null;
  const queue = createOpenIntentQueue({
    dispatch: (i) => sent.push(i),
    fallbackMs: 4000,
    setTimer: (fn) => {
      fire = fn;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => {
      fire = null;
    },
  });
  return { sent, queue, runTimer: () => fire?.() };
};
const SHEET: OpenIntent = { channel: "sheet", eventName: "tulala:offering-request", detail: { offeringId: "a" } };

test("an intent that arrives BEFORE the target mounts is drained exactly once on mount", () => {
  const { sent, queue } = harness();
  queue.request(SHEET);
  assert.equal(sent.length, 0);
  assert.equal(queue.hasQueued(), true);
  queue.announceReady("chat"); // wrong channel: nothing happens
  assert.equal(sent.length, 0);
  queue.announceReady("sheet");
  assert.deepEqual(sent, [SHEET]);
  queue.announceReady("sheet"); // a second announce never replays it
  assert.equal(sent.length, 1);
  assert.equal(queue.hasQueued(), false);
});

test("an intent after the target is ready dispatches immediately, once", () => {
  const { sent, queue } = harness();
  queue.announceReady("chat");
  queue.request({ channel: "chat" });
  assert.deepEqual(sent, [{ channel: "chat" }]);
});

test("latest queued intent wins and the fallback never delivers twice", () => {
  const { sent, queue, runTimer } = harness();
  queue.request({ channel: "chat" });
  queue.request(SHEET);
  queue.announceReady("sheet");
  runTimer(); // timer was cleared on drain
  assert.deepEqual(sent, [SHEET]);
});

test("bounded fallback: a sheet that never mounts degrades to the chat, never lost", () => {
  const { sent, queue, runTimer } = harness();
  queue.request(SHEET);
  runTimer();
  assert.deepEqual(sent, [{ channel: "chat" }]);
  queue.announceReady("sheet"); // a very late mount does not replay
  assert.equal(sent.length, 1);
});

test("bounded fallback for the chat channel dispatches the chat intent", () => {
  const { sent, queue, runTimer } = harness();
  queue.request({ channel: "chat" });
  runTimer();
  assert.deepEqual(sent, [{ channel: "chat" }]);
});

test("a target that unmounts is no longer ready", () => {
  const { sent, queue } = harness();
  const off = queue.announceReady("chat");
  off();
  queue.request({ channel: "chat" });
  assert.equal(sent.length, 0);
});
