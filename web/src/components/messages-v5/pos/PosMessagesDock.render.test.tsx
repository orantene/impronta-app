import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { fixtureShellEngine } from "@/components/messages-v5/shell/fixture-engine";
import { FIXTURE_TENANT } from "@/lib/messaging/fixture";

import { PosMessagesDock } from "./PosMessagesDock";

const BASE = {
  tenantId: FIXTURE_TENANT,
  tenantSlug: "fixture",
  locationSlug: "default",
  adminBasePath: "/w/fixture/admin",
  currentUserId: "user-ana",
  returnHref: "/w/fixture/admin/pos?mode=counter&order=o1",
  returnLabel: "Back to sale #1188 · $42.00 · 2 lines",
  live: false,
} as const;

function render(width: number, extra: Partial<Parameters<typeof PosMessagesDock>[0]> = {}) {
  return renderToStaticMarkup(
    <PosMessagesDock {...BASE} openOrderId="o1" initialCustomerInquiryId={null} engine={fixtureShellEngine()} forceWidth={width} {...extra} />,
  );
}

test("dock mode at >=1100, drawer below it; the strip and both tabs always render", () => {
  const docked = render(1440);
  assert.match(docked, /data-pos-messages-dock="true" data-dock-mode="dock"/);
  assert.match(docked, /data-return-strip/);
  assert.match(docked, /Back to sale #1188/);
  assert.match(docked, /data-pos-dock-tab="client"/);
  assert.match(docked, /data-pos-dock-tab="inbox"/);

  const drawer = render(900);
  assert.match(drawer, /data-pos-messages-dock="true" data-dock-mode="drawer"/);
  assert.match(drawer, /data-return-strip/);
});

test("phone width (<900) still docks the strip on top of the full-screen thread overlay", () => {
  const phone = render(390, { initialCustomerInquiryId: "inq-visitor" });
  assert.match(phone, /data-dock-mode="drawer"/);
  assert.match(phone, /data-return-strip/);
  assert.match(phone, /msgv5 msgs one/);
});

test("This client with no thread yet shows the empty state, not a blank pane", () => {
  const html = render(1440, { initialCustomerInquiryId: null });
  assert.match(html, /data-pos-dock-empty/);
  assert.doesNotMatch(html, /data-messages-v5="true"/);
});

test("This client with a thread mounts the shell on that thread, inbox rail hidden", () => {
  const html = render(1440, { initialCustomerInquiryId: "inq-visitor" });
  assert.match(html, /data-messages-v5="true"/);
  assert.match(html, /class="msgv5 msgs hide-inbox"/);
  assert.doesNotMatch(html, /data-pos-dock-empty/);
});

test("no thread and no open order starts on the Inbox tab, full shell with its own inbox rail", () => {
  const html = renderToStaticMarkup(
    <PosMessagesDock {...BASE} openOrderId={null} initialCustomerInquiryId={null} engine={fixtureShellEngine()} forceWidth={1440} />,
  );
  assert.match(html, /aria-selected="true"[^>]*data-pos-dock-tab="inbox"/);
  assert.match(html, /data-inbox-pane="desktop"/);
});

test("no inline styles, no untranslated dashboard keys, never says \"customer\" in rendered copy", () => {
  for (const html of [render(1440), render(900, { initialCustomerInquiryId: "inq-visitor" })]) {
    assert.doesNotMatch(html, /style="/);
    assert.doesNotMatch(html, /dashboard\.messagesV5\./);
    assert.doesNotMatch(html, /—/);
    assert.doesNotMatch(html, /customer/i);
  }
});
