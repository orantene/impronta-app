import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { buildPosDockCopy } from "./pos-copy";
import { PosPhoneNav } from "./PosPhoneNav";

const COPY = buildPosDockCopy((key: string) => {
  const table: Record<string, string> = {
    "dashboard.messagesV5.pos.thisClient": "This client",
    "dashboard.messagesV5.pos.inbox": "Inbox",
    "dashboard.messagesV5.pos.noThreadYet": "No conversation for this sale yet",
    "dashboard.messagesV5.pos.noThreadBody": "Messages linked to this sale will show up here.",
    "dashboard.messagesV5.pos.phoneSale": "Sale",
    "dashboard.messagesV5.pos.phoneOrders": "Orders",
    "dashboard.messagesV5.pos.phoneMessages": "Messages",
    "dashboard.messagesV5.pos.phoneClients": "Clients",
    "dashboard.messagesV5.pos.phoneMore": "More",
  };
  return table[key] ?? key;
});

test("draws Sale · Orders · Messages · Clients · More, in that order", () => {
  const html = renderToStaticMarkup(<PosPhoneNav copy={COPY} active="messages" onSelect={() => {}} />);
  const order = ["sale", "orders", "messages", "clients", "more"];
  let lastIndex = -1;
  for (const id of order) {
    const idx = html.indexOf(`data-pos-phone-nav-item="${id}"`);
    assert.ok(idx > lastIndex, `${id} should appear after the previous item`);
    lastIndex = idx;
  }
  assert.match(html, />Sale</);
  assert.match(html, />Orders</);
  assert.match(html, />Messages</);
  assert.match(html, />Clients</);
  assert.match(html, />More</);
});

test("the active tab is aria-current; the unread badge only draws on Messages and only when > 0", () => {
  const active = renderToStaticMarkup(<PosPhoneNav copy={COPY} active="orders" onSelect={() => {}} />);
  assert.match(active, /data-pos-phone-nav-item="orders" aria-current="page"/);

  const withUnread = renderToStaticMarkup(<PosPhoneNav copy={COPY} active="sale" messagesUnread={3} onSelect={() => {}} />);
  assert.match(withUnread, /data-pos-phone-nav-count="messages"[^>]*>3</);
  assert.doesNotMatch(withUnread, /data-pos-phone-nav-count="sale"/);

  const noUnread = renderToStaticMarkup(<PosPhoneNav copy={COPY} active="sale" messagesUnread={0} onSelect={() => {}} />);
  assert.doesNotMatch(noUnread, /data-pos-phone-nav-count/);
});

test("no inline styles", () => {
  const html = renderToStaticMarkup(<PosPhoneNav copy={COPY} active="sale" onSelect={() => {}} />);
  assert.doesNotMatch(html, /style="/);
});
