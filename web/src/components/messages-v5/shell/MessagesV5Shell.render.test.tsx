import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { FIXTURE_TENANT } from "@/lib/messaging/fixture";

import { fixtureShellEngine } from "./fixture-engine";
import { MessagesV5Shell } from "./MessagesV5Shell";
import { ShellPreview } from "./ShellPreview";

function render(width: number) {
  return renderToStaticMarkup(<MessagesV5Shell tenantId={FIXTURE_TENANT} tenantSlug="fixture" currentUserId="user-ana" engine={fixtureShellEngine()} forceWidth={width} live={false} />);
}

test("the shell's root class per width: three columns at 1440, .tab at 1194, .one at 390; the first paint is the inbox skeleton and the empty thread", () => {
  const three = render(1440);
  assert.match(three, /class="msgv5 msgs" data-messages-v5="true" data-layout="three"/);
  assert.match(three, /data-inbox="desktop"/);
  assert.match(three, /data-skeleton/);
  assert.match(three, /data-thread="none"/);
  assert.match(three, /data-context-panel="empty"/);
  const two = render(1194);
  assert.match(two, /class="msgv5 msgs tab" data-messages-v5="true" data-layout="two"/);
  assert.doesNotMatch(two, /data-context-panel/);
  const one = render(390);
  assert.match(one, /class="msgv5 msgs one pane-inbox" data-messages-v5="true" data-layout="one"/);
  assert.match(one, /data-inbox="mobile"/);
  for (const html of [three, two, one]) {
    assert.doesNotMatch(html, /style="/);
    assert.doesNotMatch(html, /dashboard\.messagesV5\./);
    assert.doesNotMatch(html, /—/);
    assert.doesNotMatch(html, /customer/i);
  }
});

test("the dev preview draws the three frames", () => {
  const html = renderToStaticMarkup(<ShellPreview />);
  for (const w of [390, 1194, 1440]) assert.match(html, new RegExp(`data-shell-width="${w}"`));
  assert.match(html, /class="msgv5 shell-preview"/);
});
