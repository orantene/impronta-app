import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "./test-copy";
import { TimesCard } from "./TimesCard";

const slots = [
  { id: "a", label: "Sat 09:30" },
  { id: "b", label: "Sat 11:00", picked: true },
  { id: "c", label: "Sat 14:00", unavailable: true },
];
const base = { withName: "Dani", clientName: "Carla", slots, copy: EN_COPY, detail: "Balayage · 2h 30m · Chair 3", onAction: () => {} };

test("sent: waiting for the pick; picked: on chip, held sentence, Confirm time", () => {
  const sent = renderToStaticMarkup(<TimesCard {...base} state="sent" slots={slots.map((s) => ({ ...s, picked: false }))} />);
  assert.match(sent, /class="cat">Times</);
  assert.match(sent, /with Dani/);
  assert.match(sent, /Waiting for Carla to pick/);
  assert.doesNotMatch(sent, /data-times-action/);
  const picked = renderToStaticMarkup(<TimesCard {...base} state="picked" holdLeft="12:41" />);
  assert.match(picked, /chip on">Sat 11:00/);
  assert.match(picked, /chip soft off">Sat 14:00/);
  assert.match(picked, /Carla picked Sat 11:00 · held 15 min · 12:41 left/);
  assert.match(picked, /btn primary sm[^>]*data-times-action="confirm"[^>]*>Confirm time/);
});

test("hold ended reads the sentence and offers new times; empty slots say so; busy", () => {
  const ended = renderToStaticMarkup(<TimesCard {...base} state="hold_ended" />);
  assert.match(ended, /The hold ended\. Offer a new time\./);
  assert.match(ended, /data-times-action="offer_new"/);
  const empty = renderToStaticMarkup(<TimesCard {...base} state="sent" slots={[]} />);
  assert.match(empty, /No free times on that day/);
  assert.match(renderToStaticMarkup(<TimesCard {...base} state="picked" busy />), /aria-busy="true"/);
});
