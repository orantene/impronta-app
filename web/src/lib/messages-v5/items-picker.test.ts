import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cardKindForCategory,
  categoryOrderForPreset,
  filterCatalog,
  groupCatalog,
  holdRefusal,
  isSelectable,
  plannedCardKinds,
  selectionTotal,
  sendModeToEngineCall,
  timesPayload,
  timesSelectionState,
  type CatalogRow,
  type Selection,
} from "./items-picker";

const TALENT: CatalogRow = { id: "talent:t1", category: "talent", title: "Sofía Herrera", sub: null, amountCents: null, availability: { kind: "free" }, talentProfileId: "t1" };
const TALENT_BUSY: CatalogRow = { id: "talent:t2", category: "talent", title: "Anto", sub: null, amountCents: null, availability: { kind: "busy", reason: "booked" }, talentProfileId: "t2" };
const PACKAGE: CatalogRow = { id: "package:o1", category: "package", title: "Gala Duo package", sub: "5h", amountCents: 100_000, availability: { kind: "free" }, offeringId: "o1" };
const SERVICE: CatalogRow = { id: "service:o2", category: "service", title: "Manicure", sub: "45 min", amountCents: 4_500, availability: { kind: "free" }, offeringId: "o2", durationMinutes: 45 };
const MENU: CatalogRow = { id: "menu:o3", category: "menu", title: "Tacos al pastor", sub: null, amountCents: 1_200, availability: { kind: "free" }, offeringId: "o3" };
const CLASS: CatalogRow = { id: "class:s1", category: "class", title: "Morning yoga", sub: "4 left", amountCents: null, availability: { kind: "free" }, offeringId: "o4", sessionId: "s1", startsAt: "2026-10-03T14:00:00Z", endsAt: "2026-10-03T15:00:00Z" };
const TICKET: CatalogRow = {
  id: "ticket:s2",
  category: "ticket",
  title: "Lumina night",
  sub: "2 tiers",
  amountCents: 2_500,
  availability: { kind: "free" },
  offeringId: "o5",
  sessionId: "s2",
  eventId: "e1",
  startsAt: "2026-10-10T03:00:00Z",
  tiers: [
    { variantId: "v1", label: "General", amountCents: 2_500, seatsLeft: 40 },
    { variantId: "v2", label: "VIP", amountCents: 9_000, seatsLeft: 0 },
  ],
};
const TABLE: CatalogRow = { id: "table:2026-09-19T20:00:00Z", category: "table", title: "8:00 PM", sub: "2026-09-19 · 2", amountCents: null, availability: { kind: "free" }, startsAt: "2026-09-19T20:00:00Z", partySize: 2 };

test("categoryOrderForPreset: agency leads with Talent, a restaurant with Menu, a salon with Services; every category always present", () => {
  assert.equal(categoryOrderForPreset("agency")[0], "talent");
  assert.equal(categoryOrderForPreset("restaurant")[0], "menu");
  assert.equal(categoryOrderForPreset("restaurant")[1], "table");
  assert.equal(categoryOrderForPreset("salon_barber")[0], "service");
  assert.equal(categoryOrderForPreset("sports_venue")[0], "ticket");
  for (const raw of ["agency", "restaurant", "salon_barber", "sports_venue", null, "garbage"]) {
    assert.deepEqual([...categoryOrderForPreset(raw)].sort(), ["class", "menu", "package", "service", "table", "talent", "ticket"]);
  }
});

test("groupCatalog: buckets in the business's order and drops empty categories", () => {
  const groups = groupCatalog([MENU, TALENT, PACKAGE, TALENT_BUSY], categoryOrderForPreset("restaurant"));
  assert.deepEqual(
    groups.map((g) => [g.category, g.rows.length]),
    [
      ["menu", 1],
      ["package", 1],
      ["talent", 2],
    ],
  );
  assert.deepEqual(groupCatalog([], categoryOrderForPreset("agency")), []);
});

test("filterCatalog: a category narrows first, then a case-insensitive substring over title and sub", () => {
  const rows = [TALENT, PACKAGE, SERVICE, MENU];
  assert.deepEqual(filterCatalog(rows, "", "all").length, 4);
  assert.deepEqual(filterCatalog(rows, "gala", "all").map((r) => r.id), ["package:o1"]);
  assert.deepEqual(filterCatalog(rows, "45 MIN", "all").map((r) => r.id), ["service:o2"]);
  assert.deepEqual(filterCatalog(rows, "", "menu").map((r) => r.id), ["menu:o3"]);
  assert.deepEqual(filterCatalog(rows, "sof", "menu"), []);
});

test("isSelectable: a busy row cannot be picked", () => {
  assert.equal(isSelectable(TALENT), true);
  assert.equal(isSelectable(TALENT_BUSY), false);
  assert.equal(isSelectable({ ...TALENT, availability: { kind: "unknown" } }), true);
});

test("selectionTotal: sums priced lines times units, the chosen tier for tickets, marks a priceless row as partial, adds the custom line", () => {
  const selected: Selection[] = [
    { row: PACKAGE, units: 1 },
    { row: MENU, units: 3 },
    { row: TICKET, units: 2, variantId: "v1" },
  ];
  assert.deepEqual(selectionTotal(selected), { count: 3, totalCents: 100_000 + 3_600 + 5_000, partial: false });
  assert.deepEqual(selectionTotal([{ row: TALENT, units: 1 }, { row: PACKAGE, units: 1 }]), { count: 2, totalCents: 100_000, partial: true });
  assert.deepEqual(selectionTotal([], { label: "Sound check", amountCents: 15_000 }), { count: 1, totalCents: 15_000, partial: false });
  assert.deepEqual(selectionTotal([{ row: TICKET, units: 1, variantId: "nope" }]), { count: 1, totalCents: 0, partial: true });
});

test("cardKindForCategory: one card kind per category; tables reuse service_card (D-MSG-156)", () => {
  assert.equal(cardKindForCategory("talent"), "service_card");
  assert.equal(cardKindForCategory("package"), "service_card");
  assert.equal(cardKindForCategory("service"), "service_card");
  assert.equal(cardKindForCategory("class"), "class_card");
  assert.equal(cardKindForCategory("ticket"), "tickets_card");
  assert.equal(cardKindForCategory("menu"), "menu_options");
  assert.equal(cardKindForCategory("table"), "service_card");
});

test("sendModeToEngineCall offer: shared draft first, one line per row (talent via the lineup engine), the custom line, then create_offer", () => {
  const calls = sendModeToEngineCall({
    mode: "offer",
    selected: [
      { row: TALENT, units: 1 },
      { row: PACKAGE, units: 1 },
      { row: CLASS, units: 2 },
      { row: TICKET, units: 3, variantId: "v1" },
    ],
    custom: { label: "Sound check", amountCents: 15_000 },
    timezone: "America/Cancun",
  });
  assert.deepEqual(
    calls.map((c) => c.action),
    ["ensure_shared_draft", "add_talent", "add_line", "add_line", "add_line", "add_custom_line", "dispatch"],
  );
  assert.deepEqual(calls[1], { action: "add_talent", talentProfileId: "t1", label: "Sofía Herrera" });
  assert.deepEqual(calls[2], { action: "add_line", offeringId: "o1", units: 1, label: "Gala Duo package" });
  assert.deepEqual(calls[3], { action: "add_line", offeringId: "o4", units: 2, sessionId: "s1", label: "Morning yoga" });
  assert.deepEqual(calls[4], { action: "add_line", offeringId: "o5", units: 3, sessionId: "s2", variantId: "v1", label: "Lumina night" });
  assert.deepEqual(calls[5], { action: "add_custom_line", label: "Sound check", amountCents: 15_000 });
  assert.deepEqual(calls[6], { action: "dispatch", id: "create_offer" });
});

test("sendModeToEngineCall draft: the same lines, no create_offer; talent alone needs no shared draft", () => {
  const withLines = sendModeToEngineCall({ mode: "draft", selected: [{ row: PACKAGE, units: 1 }], custom: null, timezone: "UTC" });
  assert.deepEqual(withLines.map((c) => c.action), ["ensure_shared_draft", "add_line"]);
  const talentOnly = sendModeToEngineCall({ mode: "draft", selected: [{ row: TALENT, units: 1 }], custom: null, timezone: "UTC" });
  assert.deepEqual(talentOnly.map((c) => c.action), ["add_talent"]);
});

test("sendModeToEngineCall choices: one card per kind with the selected options in the payload; nothing touches the draft", () => {
  const calls = sendModeToEngineCall({
    mode: "choices",
    selected: [
      { row: TALENT, units: 1 },
      { row: PACKAGE, units: 1 },
      { row: MENU, units: 1 },
      { row: CLASS, units: 1 },
      { row: TICKET, units: 1, variantId: "v1" },
    ],
    custom: null,
    timezone: "America/Cancun",
  });
  assert.deepEqual(calls.map((c) => c.action), ["send_options", "send_options", "send_options", "send_options"]);
  const kinds = plannedCardKinds(calls);
  assert.deepEqual(kinds, ["service_card", "menu_options", "class_card", "tickets_card"]);
  const service = calls[0];
  assert.ok(service.action === "send_options");
  assert.deepEqual(service.payload.labels, ["Sofía Herrera", "Gala Duo package"]);
  assert.deepEqual(service.payload.offeringIds, ["o1"]);
  assert.deepEqual(service.payload.talentProfileIds, ["t1"]);
  assert.equal(service.payload.currency, "USD");
  const menu = calls[1];
  assert.ok(menu.action === "send_options");
  assert.deepEqual(menu.payload, { offeringIds: ["o3"], labels: ["Tacos al pastor"], pricesCents: [1_200], currency: "USD" });
  const klass = calls[2];
  assert.ok(klass.action === "send_options");
  assert.equal(klass.payload.sessionId, "s1");
  assert.equal(klass.payload.timezone, "America/Cancun");
  const tickets = calls[3];
  assert.ok(tickets.action === "send_options");
  assert.deepEqual(tickets.payload.tiers, [
    { id: "v1", label: "General", priceCents: 2_500 },
    { id: "v2", label: "VIP", priceCents: 9_000 },
  ]);
});

test("tables are sendable as choices (D-MSG-156): one service_card with variant table, a custom line still seams", () => {
  const choices = sendModeToEngineCall({ mode: "choices", selected: [{ row: TABLE, units: 1 }], custom: { label: "x", amountCents: 1 }, timezone: "UTC" });
  assert.equal(choices.length, 2);
  assert.deepEqual(choices[1], { action: "seam", category: "menu", reason: "custom_not_a_choice" });
  const tableCall = choices[0];
  assert.ok(tableCall.action === "send_options");
  assert.equal(tableCall.kind, "service_card");
  assert.equal(tableCall.payload.variant, "table");
  assert.deepEqual(tableCall.payload.labels, ["8:00 PM"]);
  assert.equal((tableCall.payload.tables as { partySize: number }[])[0].partySize, 2);
});

test("seams are calls, not silent drops: a table as a draft/offer line has no writer", () => {
  const draft = sendModeToEngineCall({ mode: "draft", selected: [{ row: TABLE, units: 1 }], custom: null, timezone: "UTC" });
  assert.deepEqual(draft, [{ action: "seam", category: "table", reason: "no_writer" }]);
});

test("holdRefusal: a card whose pick would hold needs at least a linked identity", () => {
  assert.equal(holdRefusal("none", ["professional_times"]), "identity_unconfirmed");
  assert.equal(holdRefusal(null, ["class_card"]), "identity_unconfirmed");
  assert.equal(holdRefusal("none", ["service_card", "menu_options"]), null);
  assert.equal(holdRefusal("linked", ["professional_times"]), null);
  assert.equal(holdRefusal("confirmed", ["tickets_card"]), null);
});

test("timesSelectionState: 3 to 6 slots, or every slot when fewer than 3 are free", () => {
  assert.equal(timesSelectionState(0, 0), "none");
  assert.equal(timesSelectionState(2, 10), "few");
  assert.equal(timesSelectionState(3, 10), "ok");
  assert.equal(timesSelectionState(6, 10), "ok");
  assert.equal(timesSelectionState(7, 10), "many");
  assert.equal(timesSelectionState(2, 2), "ok");
  assert.equal(timesSelectionState(1, 2), "few");
});

test("timesPayload: the professional_times shape ThreadCards reads (slots[].startsAt / professionalName)", () => {
  const payload = timesPayload({ starts: ["2026-09-20T15:00:00Z", "2026-09-20T16:00:00Z"], professionalName: "Dani Ortega", talentProfileId: "t9", offeringId: null, timezone: "America/Cancun" });
  assert.deepEqual(payload, {
    slots: [
      { startsAt: "2026-09-20T15:00:00Z", professionalName: "Dani Ortega" },
      { startsAt: "2026-09-20T16:00:00Z", professionalName: "Dani Ortega" },
    ],
    talentProfileId: "t9",
    offeringId: null,
    timezone: "America/Cancun",
  });
});
