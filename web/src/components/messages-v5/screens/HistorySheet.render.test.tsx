import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ConversationHistoryEntry } from "@/lib/messaging/types";

import { EN_COPY } from "../kit/test-copy";
import { HistorySheet } from "./HistorySheet";

const noop = () => {};

// Fixed far-past dates so grouping and labels never coincide with "today" at test run time.
const ENTRIES: ConversationHistoryEntry[] = [
  { at: "2020-01-05T10:00:00Z", actorLabel: "Sofía H.", kind: "rename", text: 'Sofía H. renamed this conversation to "Beach wedding · Tulum"' },
  { at: "2020-01-05T14:30:00Z", actorLabel: "Client", kind: "offer_accepted", text: "Client accepted the offer" },
  { at: "2020-01-06T09:15:00Z", actorLabel: "System", kind: "payment_paid", text: "The payment was received" },
];

test("closed renders nothing", () => {
  assert.equal(renderToStaticMarkup(<HistorySheet entries={null} open={false} onClose={noop} copy={EN_COPY} variant="desktop" />), "");
});

test("loading: a skeleton, no list", () => {
  const html = renderToStaticMarkup(<HistorySheet entries={null} open onClose={noop} copy={EN_COPY} variant="desktop" />);
  assert.match(html, /data-skeleton/);
  assert.doesNotMatch(html, /data-history-list/);
});

test("empty: the empty state, not a blank list", () => {
  const html = renderToStaticMarkup(<HistorySheet entries={[]} open onClose={noop} copy={EN_COPY} variant="desktop" />);
  assert.match(html, /data-empty-state/);
  assert.match(html, /Nothing here yet/);
  assert.doesNotMatch(html, /data-history-list/);
});

test("ok: entries grouped by day, in order, client action text preserved, Export greyed with coming", () => {
  const html = renderToStaticMarkup(<HistorySheet entries={ENTRIES} open onClose={noop} copy={EN_COPY} variant="desktop" />);
  assert.match(html, /data-history-list/);
  const dayMatches = [...html.matchAll(/data-history-day="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(dayMatches.length, 2, "two distinct days");
  assert.match(html, /Jan 5, 2020/);
  assert.match(html, /Jan 6, 2020/);
  assert.match(html, /renamed this conversation to/);
  assert.match(html, /Client accepted the offer/);
  assert.match(html, /The payment was received/);
  assert.match(html, /disabled=""[^>]*data-history-export[^>]*>Export/);
  assert.match(html, /Coming soon/);
  assert.doesNotMatch(html, /style=/);
});

test("a load failure shows the refusal sentence, not the skeleton or empty state", () => {
  const html = renderToStaticMarkup(<HistorySheet entries={null} open onClose={noop} copy={EN_COPY} variant="desktop" error="unavailable" />);
  assert.match(html, /data-refusal="unavailable"/);
  assert.doesNotMatch(html, /data-skeleton/);
});

test("mobile variant renders as a bottom sheet with the mx grammar", () => {
  const html = renderToStaticMarkup(<HistorySheet entries={ENTRIES} open onClose={noop} copy={EN_COPY} variant="mobile" />);
  assert.match(html, /class="mx-sheet h92"/);
  assert.match(html, /class="mx-day" data-day-separator/);
});
