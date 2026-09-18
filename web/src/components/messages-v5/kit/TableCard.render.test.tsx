import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ladderFor } from "@/lib/messages-v5/record-cards";

import { TableCard } from "./TableCard";
import { EN_COPY } from "./test-copy";

const LADDER_COPY = EN_COPY.ladder;

test("held: Held pill, hold countdown foot, Confirm table action", () => {
  const html = renderToStaticMarkup(
    <TableCard clientName="Diego" partySize={4} whenLabel="Tonight 7:30 PM" ladder={ladderFor("reservation", {}, LADDER_COPY)} step="held" holdLeftLabel="10 min left" copy={EN_COPY} onAction={() => {}} />,
  );
  assert.match(html, /card k-table[^"]*" data-card="table"/);
  assert.match(html, /pill due">Held/);
  assert.match(html, /10 min left/);
  assert.match(html, /data-table-action="confirm">Confirm table/);
  assert.match(html, /<b>Held<\/b>/);
});

test("confirmed: Open in Reservations action, no countdown", () => {
  const html = renderToStaticMarkup(
    <TableCard clientName="Diego" partySize={2} whenLabel="Tomorrow 8 PM" ladder={ladderFor("reservation", { paymentState: "paid" }, LADDER_COPY)} step="confirmed" copy={EN_COPY} onAction={() => {}} />,
  );
  assert.match(html, /data-table-action="open_record">Open in Reservations/);
  assert.doesNotMatch(html, /min left/);
});

test("seated and closed: seated shows Seated pill + Open action, closed shows the ended sentence and no action", () => {
  const seated = renderToStaticMarkup(<TableCard clientName="Diego" partySize={2} whenLabel="Now" ladder={ladderFor("reservation", { fulfilmentState: "seated" }, LADDER_COPY)} step="seated" copy={EN_COPY} onAction={() => {}} />);
  assert.match(seated, /pill money">Seated/);
  assert.match(seated, /data-table-action="open_record"/);

  const closed = renderToStaticMarkup(<TableCard clientName="Diego" partySize={2} whenLabel="Last night" ladder={ladderFor("reservation", { fulfilmentState: "cancelled" }, LADDER_COPY)} step="closed" copy={EN_COPY} onAction={() => {}} />);
  assert.match(closed, /pill lost">Closed/);
  assert.match(closed, /The hold ended/);
  assert.doesNotMatch(closed, /data-table-action/);
});

test("busy confirm reads Confirming", () => {
  const html = renderToStaticMarkup(<TableCard clientName="Diego" partySize={4} whenLabel="Tonight" ladder={ladderFor("reservation", {}, LADDER_COPY)} step="held" busy copy={EN_COPY} onAction={() => {}} />);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, />Confirming</);
});
