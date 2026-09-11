import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SALES_TYPE_CHIPS,
  salesMoneyPresentation,
  salesSourceHref,
  filterSalesRows,
  filterSalesRowsByChannel,
  distinctChannels,
  salesChannelChips,
  salesChannelLabel,
  salesFilterHref,
  salesKindLabel,
} from "./activity-shape";

test("type chips cover the cross-product kinds", () => {
  assert.ok(SALES_TYPE_CHIPS.includes("admission"));
  assert.ok(SALES_TYPE_CHIPS.includes("project"));
  assert.ok(SALES_TYPE_CHIPS.includes("appointment"));
});

test("free registration never presents as unpaid", () => {
  const r = salesMoneyPresentation({
    kind: "registration",
    totalCents: 0,
    status: "confirmed",
  });
  assert.equal(r.treatAsFree, true);
  assert.equal(r.amountDueLabel, "Free");
});

test("source link prefers an absolute path", () => {
  assert.equal(
    salesSourceHref({ tenantSlug: "acme", kind: "order", sourcePath: "orders/o1" }),
    "/acme/admin/orders/o1",
  );
});

test("filter keeps kind chips honest", () => {
  const rows = filterSalesRows(
    [{ kind: "order" }, { kind: "registration" }, { kind: "admission" }],
    "registration",
  );
  assert.deepEqual(rows, [{ kind: "registration" }]);
});

test("kind label is filled in for every locale this platform ships", () => {
  assert.equal(salesKindLabel("order", "en"), "Order");
  assert.equal(salesKindLabel("order", "es"), "Pedido");
  assert.equal(salesKindLabel("order", "fr"), "Commande");
});

test("channel filter — 'all' keeps everything, a real channel narrows to exactly that channel", () => {
  const rows = [
    { id: "1", sourceChannel: "pos" },
    { id: "2", sourceChannel: "menu" },
    { id: "3", sourceChannel: null },
  ];
  assert.equal(filterSalesRowsByChannel(rows, "all").length, 3);
  assert.deepEqual(
    filterSalesRowsByChannel(rows, "pos").map((r) => r.id),
    ["1"],
  );
  // A row with no channel (a booking/reservation/registration — nothing
  // tracks a channel for those) never matches a specific channel filter, so
  // it does not silently appear under the wrong bucket.
  assert.equal(filterSalesRowsByChannel(rows, "menu").some((r) => r.id === "3"), false);
});

test("distinctChannels reads what is actually in the rows, never a hardcoded guess", () => {
  const rows = [
    { sourceChannel: "pos" },
    { sourceChannel: "menu" },
    { sourceChannel: "pos" },
    { sourceChannel: null },
  ];
  assert.deepEqual(distinctChannels(rows), ["menu", "pos"]);
});

test("an unrecognised channel still renders — its raw value, never hidden", () => {
  assert.equal(salesChannelLabel("some_future_channel", "en"), "some_future_channel");
  assert.equal(salesChannelLabel("pos", "en"), "Counter");
  assert.equal(salesChannelLabel("pos", "fr"), "Comptoir");
});

// ── Filter addresses ────────────────────────────────────────────────────
//
// These four exist because the reset chips shipped dead. The page built a
// chip's address as a bare query string and returned "" when the resulting
// filter set was empty, which is precisely the two reset chips. An empty
// href means "this document", so clicking "All kinds" on a filtered page
// re-resolved to that same filtered page. The assertion that would have
// caught it is the third one: RESOLVE the address the way a browser does,
// then look at what is left.

test("a reset chip's address is the list itself, never an empty string", () => {
  const href = salesFilterHref({ tenantSlug: "acme", kind: "all", channel: "all" });
  assert.notEqual(href, "");
  assert.equal(href, "/acme/admin/sales");
});

test("a chip that narrows carries the filters in its own address", () => {
  assert.equal(
    salesFilterHref({ tenantSlug: "acme", kind: "order", channel: "pos" }),
    "/acme/admin/sales?kind=order&channel=pos",
  );
  // Clearing the kind keeps the channel, and vice versa: the two filters are
  // independent and one chip must never silently drop the other.
  assert.equal(
    salesFilterHref({ tenantSlug: "acme", kind: "all", channel: "pos" }),
    "/acme/admin/sales?channel=pos",
  );
  assert.equal(
    salesFilterHref({ tenantSlug: "acme", kind: "order", channel: "all" }),
    "/acme/admin/sales?kind=order",
  );
});

test("resolved from a filtered page, every reset chip lands on the UNFILTERED list", () => {
  const onAFilteredPage = "https://app.example/acme/admin/sales?kind=order&channel=pos";

  // "All kinds" while a channel is also on: the kind goes, the channel stays.
  const allKinds = new URL(
    salesFilterHref({ tenantSlug: "acme", kind: "all", channel: "pos" }),
    onAFilteredPage,
  );
  assert.equal(allKinds.pathname, "/acme/admin/sales");
  assert.equal(allKinds.search, "?channel=pos");

  // "All channels" while a kind is also on.
  const allChannels = new URL(
    salesFilterHref({ tenantSlug: "acme", kind: "order", channel: "all" }),
    onAFilteredPage,
  );
  assert.equal(allChannels.search, "?kind=order");

  // Both cleared: nothing survives the resolution. This is the assertion an
  // empty href fails — it would resolve back to "?kind=order&channel=pos".
  const cleared = new URL(
    salesFilterHref({ tenantSlug: "acme", kind: "all", channel: "all" }),
    onAFilteredPage,
  );
  assert.equal(cleared.pathname, "/acme/admin/sales");
  assert.equal(cleared.search, "");
});

test("the chip that clears a channel survives a kind with no rows on that channel", () => {
  // The kind filter emptied the list, so the rows carry no channels at all.
  // The selected channel must still be offered, or the only control that
  // could undo it disappears along with the rows it filtered away.
  assert.deepEqual(salesChannelChips([], "pos"), ["pos"]);
  assert.deepEqual(salesChannelChips(["menu"], "pos"), ["menu", "pos"]);
  // Nothing selected and nothing present: no strip, which is correct.
  assert.deepEqual(salesChannelChips([], "all"), []);
  // Already present: offered once, not twice.
  assert.deepEqual(salesChannelChips(["menu", "pos"], "pos"), ["menu", "pos"]);
});
