import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ladderFor } from "@/lib/messages-v5/record-cards";

import { TicketsCard } from "./TicketsCard";
import { EN_COPY } from "./test-copy";

const LADDER_COPY = EN_COPY.ladder;
const tiers = [{ label: "General", quantity: 2, priceCents: 5000 }];

test("paid: unpaid pill, hold countdown, Request payment action", () => {
  const html = renderToStaticMarkup(
    <TicketsCard title="Fri night" clientName="Diego" tiers={tiers} ladder={ladderFor("tickets", {}, LADDER_COPY)} step="paid" holdLeftLabel="5 min left" copy={EN_COPY} onAction={() => {}} />,
  );
  assert.match(html, /card k-ticket[^"]*" data-card="tickets"/);
  assert.match(html, /pill due">Unpaid/);
  assert.match(html, /5 min left/);
  assert.match(html, /data-tickets-action="request_payment">Request payment/);
  assert.match(html, /2 × General/);
});

test("issued: Open at the door + copy link actions, no countdown", () => {
  const html = renderToStaticMarkup(
    <TicketsCard title="Fri night" clientName="Diego" tiers={tiers} ladder={ladderFor("tickets", { paymentState: "paid" }, LADDER_COPY)} step="issued" copy={EN_COPY} onAction={() => {}} />,
  );
  assert.match(html, /pill money">Issued/);
  assert.match(html, /data-tickets-action="open_at_door"/);
  assert.match(html, /data-tickets-action="copy_link"/);
  assert.doesNotMatch(html, /min left/);
});

test("checked_in: N of M pill, no actions", () => {
  const html = renderToStaticMarkup(
    <TicketsCard title="Fri night" clientName="Diego" tiers={tiers} ladder={ladderFor("tickets", { fulfilmentState: "checked_in" }, LADDER_COPY)} step="checked_in" checkedIn={1} total={2} copy={EN_COPY} onAction={() => {}} />,
  );
  assert.match(html, /pill ch">Checked in 1 of 2/);
  assert.doesNotMatch(html, /data-tickets-action/);
});

test("done: Done pill, ladder fully lit, no actions", () => {
  const html = renderToStaticMarkup(<TicketsCard title="Fri night" clientName="Diego" tiers={tiers} ladder={ladderFor("tickets", { fulfilmentState: "done" }, LADDER_COPY)} step="done" copy={EN_COPY} onAction={() => {}} />);
  assert.match(html, /pill money">Done/);
  assert.match(html, /<b>Done<\/b>/);
});
