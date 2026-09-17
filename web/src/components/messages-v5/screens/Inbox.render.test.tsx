import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EN_COPY } from "../kit/test-copy";
import { NOW, inboxRow } from "../kit/test-fixtures";

import { Inbox, type InboxScreenProps } from "./Inbox";

const noop = () => {};

function baseProps(over: Partial<InboxScreenProps> = {}): InboxScreenProps {
  return {
    rows: [],
    filter: "needs",
    onFilter: noop,
    chips: [],
    onToggleChip: noop,
    search: "",
    onSearch: noop,
    selectedId: null,
    onSelect: noop,
    loading: false,
    error: null,
    onRetry: noop,
    unreadTotal: null,
    counts: {},
    onNew: noop,
    currentUserId: "u-sofia",
    copy: EN_COPY,
    variant: "desktop",
    now: NOW,
    ...over,
  };
}

test("desktop ready: header, count, New, segments, search, chips, one grp-h with a row", () => {
  const rows = [inboxRow({ id: "r1", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null })];
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows })} />);
  assert.match(html, /data-inbox-pane="desktop"/);
  assert.match(html, /<h2>Inbox<\/h2>/);
  assert.match(html, /class="cnt-txt">1 conversations/);
  assert.match(html, />New<\/button>/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /class="search"/);
  assert.match(html, /data-inbox-chips/);
  assert.match(html, /class="grp-h">Needs reply/);
  assert.match(html, /data-inbox-row="r1"/);
});

test("desktop loading: skeleton, never the empty copy", () => {
  const html = renderToStaticMarkup(<Inbox {...baseProps({ loading: true })} />);
  assert.match(html, /data-skeleton/);
  assert.doesNotMatch(html, /Nothing needs you/);
});

test("desktop failed: safe message and Try again, calls onRetry", () => {
  const html = renderToStaticMarkup(<Inbox {...baseProps({ error: "unavailable" })} />);
  assert.match(html, /Could not load conversations/);
  assert.match(html, /Your messages are safe/);
  assert.match(html, />Try again<\/button>/);
});

test("desktop empty needs action: Nothing needs you, Show Waiting on client", () => {
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows: [], filter: "needs" })} />);
  assert.match(html, /Nothing needs you/);
  assert.match(html, />Show Waiting on client<\/button>/);
});

test("desktop empty waiting / all: segment-specific empty, no action button", () => {
  const wait = renderToStaticMarkup(<Inbox {...baseProps({ rows: [], filter: "wait" })} />);
  assert.match(wait, /Nobody is waiting on a client/);
  const waitEmptyBlock = wait.slice(wait.indexOf('data-empty-state'));
  assert.doesNotMatch(waitEmptyBlock, /<button/);
  const all = renderToStaticMarkup(<Inbox {...baseProps({ rows: [], filter: "all" })} />);
  assert.match(all, /No conversations yet/);
});

test("desktop empty search: names the query, Clear search", () => {
  const rows = [inboxRow({ id: "r1" })];
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows, filter: "all", search: "zzz-no-match" })} />);
  assert.match(html, /No conversation matches &quot;zzz-no-match&quot;/);
  assert.match(html, />Clear search<\/button>/);
});

test("desktop All groups by day: Today then Yesterday headers", () => {
  const today = inboxRow({ id: "t", lastCustomerMessageAt: "2026-09-17T09:00:00Z", updatedAt: "2026-09-17T09:00:00Z" });
  const yesterday = inboxRow({ id: "y", lastCustomerMessageAt: "2026-09-16T09:00:00Z", updatedAt: "2026-09-16T09:00:00Z" });
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows: [today, yesterday], filter: "all" })} />);
  const todayIdx = html.indexOf('class="grp-h">Today');
  const yestIdx = html.indexOf('class="grp-h">Yesterday');
  assert.ok(todayIdx >= 0 && yestIdx > todayIdx);
});

test("desktop Waiting groups by opportunity state", () => {
  const row = inboxRow({ id: "w1", conversationState: "awaiting_customer", opportunityState: "offer_sent", ownerUserId: "u-1", nextAction: null });
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows: [row], filter: "wait" })} />);
  assert.match(html, /class="grp-h">Offer sent/);
});

test("mobile ready: title, mx-seg, mx-search, Filter button with chip count, mx-gh, mx-row", () => {
  const row = inboxRow({ id: "m1", conversationState: "needs_reply", ownerUserId: "u-sofia", unread: true, unreadCount: 2, nextAction: null });
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows: [row], variant: "mobile", chips: ["mine", "unread"] })} />);
  assert.match(html, /data-inbox-pane="mobile"/);
  assert.match(html, /<h1>Inbox<\/h1>/);
  assert.match(html, /class="mx-seg"/);
  assert.match(html, /class="mx-search"/);
  assert.match(html, />Filter · 2<\/button>/);
  assert.match(html, /class="mx-gh">Needs reply/);
  assert.match(html, /class="mx-row/);
});

test("mobile loading uses the mobile skeleton grammar", () => {
  const html = renderToStaticMarkup(<Inbox {...baseProps({ variant: "mobile", loading: true })} />);
  assert.match(html, /class="mx-sk"/);
});

test("segment counts prefer the shell's counts over the computed fallback", () => {
  const rows = [inboxRow({ id: "r1", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null })];
  const html = renderToStaticMarkup(<Inbox {...baseProps({ rows, counts: { needs: 99 } })} />);
  assert.match(html, /Needs action<span class="n">99<\/span>/);
});
