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

test("moneySummary: total/paid/balance in the record currency, deposit omitted when the record has no deposit rule", () => {
  const none = moneySummary({ totalCents: 380000, paidCents: 0, currencyCode: "USD" });
  assert.equal(none.totalLabel, "$3,800 USD");
  assert.equal(none.paidLabel, "$0 USD");
  assert.equal(none.balanceLabel, "$3,800 USD");
  assert.equal(none.balanceDueCents, 380000);
  assert.equal(none.depositLabel, null);
  assert.equal(none.hasTotal, true);

  const withDeposit = moneySummary({ totalCents: 380000, paidCents: 95000, depositCents: 95000, currencyCode: "USD" });
  assert.equal(withDeposit.depositLabel, "$950 USD");
  assert.equal(withDeposit.paidLabel, "$950 USD");
  assert.equal(withDeposit.balanceLabel, "$2,850 USD");
  assert.equal(withDeposit.balanceDueCents, 285000);
});

test("moneySummary: paid never exceeds total in the balance (clamped, never negative)", () => {
  const overpaid = moneySummary({ totalCents: 1000, paidCents: 5000, currencyCode: "USD" });
  assert.equal(overpaid.balanceDueCents, 0);
  assert.equal(overpaid.balanceLabel, "$0 USD");
});

test("moneySummary: no total (null) is 'no charges yet', not a $0 total", () => {
  const none = moneySummary({ totalCents: null, paidCents: 0, currencyCode: "USD" });
  assert.equal(none.hasTotal, false);
});

test("summaryAmountLabel: blank when there is no total; 'total · paid' line otherwise", () => {
  assert.equal(summaryAmountLabel(null), "");
  assert.equal(summaryAmountLabel(moneySummary({ totalCents: null, paidCents: 0, currencyCode: "USD" })), "");
  assert.equal(summaryAmountLabel(moneySummary({ totalCents: 380000, paidCents: 0, currencyCode: "USD" })), "$3,800 USD · $0 USD paid");
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
  const money = moneySummary({ totalCents: 380000, paidCents: 0, currencyCode: "USD" });
  const vm = summaryFor({ essentials, tasks, chips: [chip], copy: COPY, money });
  assert.equal(vm.isVisitor, false);
  assert.equal(vm.name, "Valentina Ruiz");
  assert.equal(vm.phone, "+52 998 123 4411");
  assert.equal(vm.next, "Reply to the client");
  assert.equal(vm.main, "Offer v2");
  assert.equal(vm.amount, "$3,800 USD · $0 USD paid");
});

test("clientHistoryLabel: omitted (null), never a fake zero, when the rollup is not readable", () => {
  assert.equal(clientHistoryLabel(null, COPY.panel.historyLine), null);
  assert.equal(clientHistoryLabel(undefined, COPY.panel.historyLine), null);
  assert.equal(clientHistoryLabel({ pastBookings: 0, totalSpendCents: 0, currencyCode: "USD" }, COPY.panel.historyLine), null);
});

test("clientHistoryLabel: 'N past bookings · $X' when a rollup is present", () => {
  const label = clientHistoryLabel({ pastBookings: 3, totalSpendCents: 45000, currencyCode: "USD" }, COPY.panel.historyLine);
  assert.equal(label, "3 past bookings · $450 USD");
});

test("itemFlagsFor: proposedBy/confirmed pass through; 'system' collapses to null (client/staff only, board flags)", () => {
  const flags = itemFlagsFor({ currencyCode: "USD", proposedBy: "client", proposedByName: "Marco", confirmedAt: "2026-09-17T10:00:00Z", drift: null });
  assert.equal(flags.proposedBy, "client");
  assert.equal(flags.proposedByName, "Marco");
  assert.equal(flags.confirmed, true);
  assert.equal(flags.priceSnapshot, null);

  const system = itemFlagsFor({ currencyCode: "USD", proposedBy: "system", proposedByName: null, confirmedAt: null, drift: null });
  assert.equal(system.proposedBy, null);
  assert.equal(system.confirmed, false);
});

test("itemFlagsFor: a drift stamps the catalog-now price; no drift leaves priceSnapshot null", () => {
  const drifted = itemFlagsFor({ currencyCode: "USD", proposedBy: "staff", proposedByName: null, confirmedAt: null, drift: { drifted: true, catalogNowCents: 1250 } });
  assert.equal(drifted.priceSnapshot, "$12.50 USD");

  const flat = itemFlagsFor({ currencyCode: "USD", proposedBy: "staff", proposedByName: null, confirmedAt: null, drift: { drifted: false, catalogNowCents: 1200 } });
  assert.equal(flat.priceSnapshot, null);
});

test("TUL-281: an MXN record shows '$850 MXN' in every Money label, summary line, history and drift hint", () => {
  const m = moneySummary({ totalCents: 85000, paidCents: 0, depositCents: 25500, currencyCode: "MXN" });
  assert.equal(m.totalLabel, "$850 MXN");
  assert.equal(m.depositLabel, "$255 MXN");
  assert.equal(m.paidLabel, "$0 MXN");
  assert.equal(m.balanceLabel, "$850 MXN");
  assert.equal(summaryAmountLabel(m), "$850 MXN · $0 MXN paid");
  assert.equal(clientHistoryLabel({ pastBookings: 2, totalSpendCents: 85000, currencyCode: "MXN" }, COPY.panel.historyLine), "2 past bookings · $850 MXN");
  const drift = itemFlagsFor({ currencyCode: "MXN", proposedBy: "staff", proposedByName: null, confirmedAt: null, drift: { drifted: true, catalogNowCents: 85000 } });
  assert.equal(drift.priceSnapshot, "$850 MXN");
});

test("TUL-281: an unknown or blank record currency falls back to the platform currency, code still shown", () => {
  assert.equal(moneySummary({ totalCents: 85000, paidCents: 0, currencyCode: "" }).totalLabel, "$850 USD");
  assert.equal(moneySummary({ totalCents: 85000, paidCents: 0, currencyCode: "??" }).totalLabel, "$850 USD");
});
