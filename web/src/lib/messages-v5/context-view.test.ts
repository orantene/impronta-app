import assert from "node:assert/strict";
import { test } from "node:test";

import { createTranslator } from "@/i18n/messages";
import { buildKitCopy } from "@/components/messages-v5/kit/copy";

import {
  clientHistoryLabel,
  itemFlagsFor,
  itemsLabelForPreset,
  itemsLabelKeyForPreset,
  mainRecordChip,
  moneySummary,
  summaryAmountLabel,
  summaryFor,
} from "./context-view";

const COPY = buildKitCopy(createTranslator("en"));

test("itemsLabelKeyForPreset: agency -> talent & services", () => {
  assert.equal(itemsLabelKeyForPreset("agency"), "talentServices");
});

test("itemsLabelKeyForPreset: restaurant/bar_club/beach_club -> menu (a real food menu, not the generic 'menu' feature flag)", () => {
  assert.equal(itemsLabelKeyForPreset("restaurant"), "menu");
  assert.equal(itemsLabelKeyForPreset("bar_club"), "menu");
  assert.equal(itemsLabelKeyForPreset("beach_club"), "menu");
});

test("itemsLabelKeyForPreset: salon/spa/clinic -> services", () => {
  assert.equal(itemsLabelKeyForPreset("salon_barber"), "services");
  assert.equal(itemsLabelKeyForPreset("spa_wellness"), "services");
  assert.equal(itemsLabelKeyForPreset("clinic"), "services");
});

test("itemsLabelKeyForPreset: a preset with 'menu: true' but no food menu (workshop_print) -> order items, not menu", () => {
  assert.equal(itemsLabelKeyForPreset("workshop_print"), "orderItems");
});

test("itemsLabelKeyForPreset: unknown/null preset fails toward custom -> order items", () => {
  assert.equal(itemsLabelKeyForPreset(null), "orderItems");
  assert.equal(itemsLabelKeyForPreset("not-a-real-preset"), "orderItems");
});

test("itemsLabelForPreset: resolves through copy, falls back to the default 'Items' label for an unknown key", () => {
  assert.equal(itemsLabelForPreset("agency", COPY), "Talent & services");
  assert.equal(itemsLabelForPreset("restaurant", COPY), "Menu");
  assert.equal(itemsLabelForPreset("custom", COPY), "Order items");
});

test("moneySummary: total/paid/balance in USD, deposit omitted when the record has no deposit rule", () => {
  const none = moneySummary({ totalCents: 380000, paidCents: 0 });
  assert.equal(none.totalLabel, "$3,800");
  assert.equal(none.paidLabel, "$0");
  assert.equal(none.balanceLabel, "$3,800");
  assert.equal(none.balanceDueCents, 380000);
  assert.equal(none.depositLabel, null);
  assert.equal(none.hasTotal, true);

  const withDeposit = moneySummary({ totalCents: 380000, paidCents: 95000, depositCents: 95000 });
  assert.equal(withDeposit.depositLabel, "$950");
  assert.equal(withDeposit.paidLabel, "$950");
  assert.equal(withDeposit.balanceLabel, "$2,850");
  assert.equal(withDeposit.balanceDueCents, 285000);
});

test("moneySummary: paid never exceeds total in the balance (clamped, never negative)", () => {
  const overpaid = moneySummary({ totalCents: 1000, paidCents: 5000 });
  assert.equal(overpaid.balanceDueCents, 0);
  assert.equal(overpaid.balanceLabel, "$0");
});

test("moneySummary: no total (null) is 'no charges yet', not a $0 total", () => {
  const none = moneySummary({ totalCents: null, paidCents: 0 });
  assert.equal(none.hasTotal, false);
});

test("summaryAmountLabel: blank when there is no total; 'total · paid' line otherwise", () => {
  assert.equal(summaryAmountLabel(null), "");
  assert.equal(summaryAmountLabel(moneySummary({ totalCents: null, paidCents: 0 })), "");
  assert.equal(summaryAmountLabel(moneySummary({ totalCents: 380000, paidCents: 0 })), "$3,800 · $0 paid");
});

test("mainRecordChip: the first live chip, or null", () => {
  assert.equal(mainRecordChip([]), null);
  const chip = { kind: "order" as const, recordId: "or-1", label: "#1203", paymentState: null, fulfilmentState: null };
  assert.equal(mainRecordChip([chip]), chip);
});

test("summaryFor: visitor with no identity and no chips draws a blank next/main/amount, not an error", () => {
  const essentials = {
    name: "",
    version: 1,
    customer: { name: "", email: null, phone: null, identityLevel: "none" as const, identityMethod: null, request: null, source: null },
    linked: [],
    notes: [],
  };
  const vm = summaryFor({ essentials, tasks: [], chips: [], copy: COPY, money: null });
  assert.equal(vm.isVisitor, true);
  assert.equal(vm.identityLabel, COPY.identity.none);
  assert.equal(vm.main, "");
  assert.equal(vm.amount, "");
  assert.equal(vm.next, COPY.next.nothing);
});

test("summaryFor: identified client with a task and a chip draws Next/Main/Amount", () => {
  const essentials = {
    name: "Valentina Ruiz",
    version: 4,
    customer: { name: "Valentina Ruiz", email: "vale@ruiz.mx", phone: "+52 998 123 4411", identityLevel: "confirmed" as const, identityMethod: "sms_code", request: null, source: "Website" },
    linked: [],
    notes: [],
  };
  const chip = { kind: "offer" as const, recordId: "iq-512", label: "Offer v2", paymentState: null, fulfilmentState: null };
  const tasks = [{ key: "reply", title: "Reply to the client", why: "The client is waiting.", primary: true }];
  const money = moneySummary({ totalCents: 380000, paidCents: 0 });
  const vm = summaryFor({ essentials, tasks, chips: [chip], copy: COPY, money });
  assert.equal(vm.isVisitor, false);
  assert.equal(vm.name, "Valentina Ruiz");
  assert.equal(vm.phone, "+52 998 123 4411");
  assert.equal(vm.next, "Reply to the client");
  assert.equal(vm.main, "Offer v2");
  assert.equal(vm.amount, "$3,800 · $0 paid");
});

test("clientHistoryLabel: omitted (null), never a fake zero, when the rollup is not readable", () => {
  assert.equal(clientHistoryLabel(null, COPY.panel.historyLine), null);
  assert.equal(clientHistoryLabel(undefined, COPY.panel.historyLine), null);
  assert.equal(clientHistoryLabel({ pastBookings: 0, totalSpendCents: 0 }, COPY.panel.historyLine), null);
});

test("clientHistoryLabel: 'N past bookings · $X' when a rollup is present", () => {
  const label = clientHistoryLabel({ pastBookings: 3, totalSpendCents: 45000 }, COPY.panel.historyLine);
  assert.equal(label, "3 past bookings · $450");
});

test("itemFlagsFor: proposedBy/confirmed pass through; 'system' collapses to null (client/staff only, board flags)", () => {
  const flags = itemFlagsFor({ proposedBy: "client", proposedByName: "Marco", confirmedAt: "2026-09-17T10:00:00Z", drift: null });
  assert.equal(flags.proposedBy, "client");
  assert.equal(flags.proposedByName, "Marco");
  assert.equal(flags.confirmed, true);
  assert.equal(flags.priceSnapshot, null);

  const system = itemFlagsFor({ proposedBy: "system", proposedByName: null, confirmedAt: null, drift: null });
  assert.equal(system.proposedBy, null);
  assert.equal(system.confirmed, false);
});

test("itemFlagsFor: a drift stamps the catalog-now price; no drift leaves priceSnapshot null", () => {
  const drifted = itemFlagsFor({ proposedBy: "staff", proposedByName: null, confirmedAt: null, drift: { drifted: true, catalogNowCents: 1250 } });
  assert.equal(drifted.priceSnapshot, "$12.50");

  const flat = itemFlagsFor({ proposedBy: "staff", proposedByName: null, confirmedAt: null, drift: { drifted: false, catalogNowCents: 1200 } });
  assert.equal(flat.priceSnapshot, null);
});
