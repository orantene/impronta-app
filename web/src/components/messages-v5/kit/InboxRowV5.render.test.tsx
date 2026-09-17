import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { InboxRowV5 } from "./InboxRowV5";
import { EN_COPY } from "./test-copy";
import { NOW, inboxRow } from "./test-fixtures";

test("ready: name, time, subject, preview, one state line, channel, count, owner", () => {
  const html = renderToStaticMarkup(<InboxRowV5 row={inboxRow()} copy={EN_COPY} now={NOW} currentUserId="u-sofia" onOpen={() => {}} />);
  assert.match(html, /<button[^>]*class="row-c unread"[^>]*data-inbox-row="inq-1"/);
  assert.match(html, /Valentina Ruiz/);
  assert.match(html, /2m/);
  assert.match(html, /class="sub">Beach wedding · Tulum · Aug 14/);
  assert.match(html, /class="pv">Can we add a second DJ set/);
  assert.match(html, /pill needs">Needs reply/);
  assert.match(html, /pill opp">Awaiting acceptance/);
  assert.match(html, /<b>Offer v2 · \$3,800<\/b>/);
  assert.match(html, /class="cnt">2</);
  assert.match(html, /avatar sm me/);
  assert.doesNotMatch(html, /style=/);
});

test("selected row is `on`; read row has no stripe and no count; unassigned reads a dashed pill", () => {
  const html = renderToStaticMarkup(<InboxRowV5 row={inboxRow({ unread: false, unreadCount: 0, ownerUserId: null, ownerLabel: null })} copy={EN_COPY} now={NOW} selected />);
  assert.match(html, /class="row-c on"/);
  assert.doesNotMatch(html, /class="cnt"/);
  assert.match(html, /pill off">unassigned/);
  assert.match(html, /aria-current="true"/);
});

test("empty name reads Visitor with an anon avatar and the no-identity pill", () => {
  const html = renderToStaticMarkup(<InboxRowV5 row={inboxRow({ contactName: "", recordChips: [], opportunityState: null })} copy={EN_COPY} now={NOW} />);
  assert.match(html, /<span>Visitor<\/span>/);
  assert.match(html, /avatar anon/);
  assert.match(html, /pill off">no identity/);
});

test("mobile variant uses the mx-row grammar with the count inline", () => {
  const html = renderToStaticMarkup(<InboxRowV5 row={inboxRow()} copy={EN_COPY} now={NOW} variant="mobile" />);
  assert.match(html, /class="mx-row unread"/);
  assert.match(html, /class="l1"><b>Valentina Ruiz<\/b><span>2m<\/span>/);
  assert.match(html, /<i class="cnt">2<\/i>/);
});
