import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SALES_TYPE_CHIPS,
  salesMoneyPresentation,
  salesSourceHref,
  filterSalesRows,
  filterSalesRowsByChannel,
  distinctChannels,
  salesChannelLabel,
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
