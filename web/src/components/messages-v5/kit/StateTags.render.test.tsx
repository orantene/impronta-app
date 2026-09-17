import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { IdentityPill, StateTags, recordStateLabel } from "./StateTags";
import { EN_COPY } from "./test-copy";
import { CHIP_APPT, CHIP_OFFER, CHIP_ORDER, STATE_BARE, STATE_NEEDS, STATE_RESOLVED, STATE_WAIT } from "./test-fixtures";

test("three families, three groups, never merged", () => {
  const html = renderToStaticMarkup(<StateTags state={STATE_NEEDS} chips={[CHIP_OFFER]} copy={EN_COPY} />);
  assert.match(html, /data-family="conversation"[^>]*><span class="pill needs">Needs reply/);
  assert.match(html, /data-family="opportunity"[^>]*><span class="pill opp">Awaiting acceptance/);
  assert.match(html, /data-family="record"/);
  assert.match(html, /<b>Offer v2 · \$3,800<\/b>/);
  assert.doesNotMatch(html, /Needs reply · Awaiting/);
});

test("record chip reads payment then fulfilment through the catalogue", () => {
  assert.equal(recordStateLabel(CHIP_ORDER, EN_COPY), "Paid · Preparing");
  assert.equal(recordStateLabel(CHIP_APPT, EN_COPY), "Deposit paid · Confirmed");
  assert.equal(recordStateLabel(CHIP_OFFER, EN_COPY), null);
  assert.equal(recordStateLabel({ paymentState: "weird", fulfilmentState: null }, EN_COPY), "weird");
});

test("won and lost use their own tones; resolved is the done tone", () => {
  const wait = renderToStaticMarkup(<StateTags state={STATE_WAIT} chips={[CHIP_ORDER]} copy={EN_COPY} />);
  assert.match(wait, /pill wait">Waiting on client/);
  assert.match(wait, /pill won">Won/);
  const resolved = renderToStaticMarkup(<StateTags state={STATE_RESOLVED} chips={[]} copy={EN_COPY} />);
  assert.match(resolved, /pill done">Resolved/);
  assert.match(resolved, /pill lost">Lost/);
});

test("empty: no opportunity, no record, visitor gets the dashed no-identity pill; maxRecords caps the record family", () => {
  const bare = renderToStaticMarkup(<StateTags state={STATE_BARE} chips={[]} copy={EN_COPY} identityLevel="none" />);
  assert.doesNotMatch(bare, /data-family="opportunity"/);
  assert.match(bare, /pill off">no identity/);
  const capped = renderToStaticMarkup(<StateTags state={STATE_WAIT} chips={[CHIP_ORDER, CHIP_APPT]} copy={EN_COPY} maxRecords={1} />);
  assert.match(capped, /#1203/);
  assert.doesNotMatch(capped, /AP-2041/);
});

test("IdentityPill: confirmed / linked / none", () => {
  assert.match(renderToStaticMarkup(<IdentityPill level="confirmed" copy={EN_COPY} />), /identity confirmed/);
  assert.match(renderToStaticMarkup(<IdentityPill level="linked" copy={EN_COPY} />), /linked to client/);
  assert.match(renderToStaticMarkup(<IdentityPill level="none" copy={EN_COPY} />), /pill off">no identity yet/);
});
