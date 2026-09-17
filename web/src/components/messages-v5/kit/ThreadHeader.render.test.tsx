import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "./test-copy";
import { CHIP_OFFER, ESSENTIALS, ESSENTIALS_VISITOR, STATE_BARE, STATE_NEEDS, STATE_RESOLVED } from "./test-fixtures";
import { ThreadHeader } from "./ThreadHeader";

const base = { essentials: ESSENTIALS, state: STATE_NEEDS, chips: [CHIP_OFFER], channel: "web_chat" as const, subject: "Beach wedding · Tulum · Aug 14", when: "80 guests", copy: EN_COPY };

test("desktop ready: back, avatar, name, identity pill, subject, channel, owner chip, state, Resolve, more; row 2 has opportunity and records", () => {
  const html = renderToStaticMarkup(<ThreadHeader {...base} owner={{ label: "Sofía H.", isMe: true }} onResolve={() => {}} />);
  assert.match(html, /data-thread-header="desktop"/);
  assert.match(html, /aria-label="Back"/);
  assert.match(html, /avatar lg/);
  assert.match(html, /<b>Valentina Ruiz<\/b>/);
  assert.match(html, /identity confirmed/);
  assert.match(html, /Beach wedding · Tulum · Aug 14 · 80 guests/);
  assert.match(html, /class="chan"[^>]*>.*Web chat/);
  assert.match(html, /class="owner"[^>]*data-thread-owner[^>]*>.*Sofía H\./);
  assert.match(html, /pill needs">Needs reply/);
  assert.match(html, /data-thread-resolve[^>]*>Resolve</);
  assert.match(html, /aria-label="More"/);
  assert.match(html, /class="r2">.*pill opp">Awaiting acceptance.*Offer v2/);
  assert.doesNotMatch(html, /style=/);
});

test("busy: Resolve reads Resolving and is aria-busy; done (resolved): Reopen replaces Resolve", () => {
  const busy = renderToStaticMarkup(<ThreadHeader {...base} owner={null} busy onResolve={() => {}} />);
  assert.match(busy, /aria-busy="true"[^>]*data-thread-resolve[^>]*>Resolving</);
  const done = renderToStaticMarkup(<ThreadHeader {...base} state={STATE_RESOLVED} chips={[]} owner={null} onReopen={() => {}} />);
  assert.match(done, /data-thread-reopen[^>]*>Reopen</);
  assert.doesNotMatch(done, /data-thread-resolve/);
  assert.match(done, /pill done">Resolved/);
});

test("empty owner reads Assign with an anon avatar; a visitor reads Visitor with no identity yet", () => {
  const html = renderToStaticMarkup(<ThreadHeader {...base} essentials={ESSENTIALS_VISITOR} state={STATE_BARE} chips={[]} owner={null} subject="Table for 6 on Friday?" when={null} />);
  assert.match(html, /<b>Visitor<\/b>/);
  assert.match(html, /avatar anon lg/);
  assert.match(html, /no identity yet/);
  assert.match(html, /Assign/);
});

test("mobile: back, name, subject, channel · owner, more; one state row with one record", () => {
  const html = renderToStaticMarkup(<ThreadHeader {...base} owner={{ label: "Sofía H.", isMe: true }} variant="mobile" />);
  assert.match(html, /data-thread-header="mobile"/);
  assert.match(html, /class="subj">Beach wedding · Tulum · Aug 14</);
  assert.match(html, /class="meta">Web chat · Sofía H\.</);
  assert.match(html, /class="st">.*Needs reply.*Offer v2/);
  const visitor = renderToStaticMarkup(<ThreadHeader {...base} essentials={ESSENTIALS_VISITOR} state={STATE_BARE} chips={[]} owner={null} variant="mobile" />);
  assert.match(visitor, /Web chat · unassigned · no identity/);
});
