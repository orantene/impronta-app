/**
 * ItemsPicker.render.test.tsx: the six states of the picker (empty catalog,
 * loading, ready, busy, refused, done) and the times sheet, each as static
 * markup over the pure views; `runSendPlan` against a fake engine (order of
 * calls, stop at the first refusal); and the registry seam (importing the
 * barrel registers `add_items` and `send_times` for lane L5).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { ItemsCatalog } from "@/lib/messages-v5/items-catalog";
import { sendModeToEngineCall, type CatalogRow, type EngineCall } from "@/lib/messages-v5/items-picker";

import { EN_COPY, ES_COPY, FR_COPY } from "../../kit/test-copy";
import { registeredActionSheet } from "../sheet-registry";
import { ItemsPickerView, rowSub, type ItemsPickerViewProps } from "./ItemsPicker";
import { runSendPlan, type ItemsActions } from "./items-actions";
import { TimesSheetView, type TimesSheetViewProps } from "./TimesSheet";
import "./index";

const noop = () => {};

const TALENT: CatalogRow = { id: "talent:t1", category: "talent", title: "Sofía Herrera", sub: null, amountCents: null, availability: { kind: "free" }, talentProfileId: "t1" };
const TALENT_BUSY: CatalogRow = { id: "talent:t2", category: "talent", title: "Anto", sub: null, amountCents: null, availability: { kind: "busy", reason: "booked" }, talentProfileId: "t2" };
const PACKAGE: CatalogRow = { id: "package:o1", category: "package", title: "Gala Duo package", sub: "5h", amountCents: 100_000, availability: { kind: "free" }, offeringId: "o1" };
const SERVICE: CatalogRow = { id: "service:o2", category: "service", title: "Manicure", sub: "45 min", amountCents: 4_500, availability: { kind: "free" }, offeringId: "o2", durationMinutes: 45 };
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

const CATALOG: ItemsCatalog = { rows: [TALENT, TALENT_BUSY, PACKAGE, SERVICE, TICKET], date: "2026-09-20", timezone: "America/Cancun", preset: "agency" };
const EMPTY: ItemsCatalog = { rows: [], date: null, timezone: "UTC", preset: "salon_barber" };

function pickerProps(over: Partial<ItemsPickerViewProps> = {}): ItemsPickerViewProps {
  return {
    open: true,
    onClose: noop,
    copy: EN_COPY,
    variant: "desktop",
    clientName: "Ana P.",
    phase: "ready",
    catalog: CATALOG,
    refusal: null,
    query: "",
    category: "all",
    selected: [],
    custom: null,
    customOpen: false,
    mode: "offer",
    seam: null,
    onQuery: noop,
    onCategory: noop,
    onToggle: noop,
    onTier: noop,
    onAddons: noop,
    onUnits: noop,
    onCustomOpen: noop,
    onCustom: noop,
    onMode: noop,
    onSend: noop,
    ...over,
  };
}

/** The opening tag of the button carrying `attr`, e.g. `data-items-send`. */
function tag(html: string, attr: string): string {
  const m = new RegExp(`<button[^>]*${attr}="true"[^>]*>`).exec(html);
  assert.ok(m, `${attr} button not rendered`);
  return m[0];
}

function houseRules(html: string) {
  assert.doesNotMatch(html, /style="/, "no inline styles");
  assert.doesNotMatch(html, /dashboard\.messagesV5\./, "no raw copy key");
  assert.doesNotMatch(html, /—/, "no em dash");
  assert.doesNotMatch(html, /customer/i, "client, never customer");
}

test("closed renders nothing", () => {
  assert.equal(renderToStaticMarkup(<ItemsPickerView {...pickerProps({ open: false })} />), "");
});

test("state 1, loading: the title, the search, a skeleton, no rows, no modes, send disabled", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "loading", catalog: null })} />);
  houseRules(html);
  assert.match(html, /Add items to this conversation/);
  assert.match(html, /data-phase="loading"/);
  assert.match(html, /data-skeleton/);
  assert.doesNotMatch(html, /data-items-row/);
  assert.doesNotMatch(html, /data-items-modes/);
  assert.match(tag(html, "data-items-send"), /disabled=""/);
});

test("state 2, empty catalog: the empty state with the publish hint, no modes", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ catalog: EMPTY })} />);
  houseRules(html);
  assert.match(html, /data-empty-state/);
  assert.match(html, /Nothing to add yet/);
  assert.match(html, /Publish a service, a package, a class or a session/);
  assert.doesNotMatch(html, /data-items-modes/);
  assert.match(html, /No date on this conversation yet/);
});

test("state 3, ready: chips in the agency's order (Talent first), rows grouped, the busy row disabled with its reason, the three modes, the date line", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps()} />);
  houseRules(html);
  assert.match(html, /data-phase="ready"/);
  assert.match(html, /Available Sep 20/);
  // Chip order: All, then the categories present in the agency order.
  const chips = [...html.matchAll(/<button type="button" class="chip[^"]*"[^>]*aria-pressed="(true|false)"[^>]*>([^<]+)<\/button>/g)].map((m) => m[2]);
  assert.deepEqual(chips.slice(0, 5), ["All", "Talent", "Packages", "Services", "Tickets"]);
  assert.match(html, /data-items-group="talent"/);
  assert.match(html, /data-items-row="talent:t2" data-availability="busy"/);
  assert.match(html, /busy booked Sep 20/);
  assert.match(html, /Gala Duo package/);
  assert.match(html, /\$1,000</);
  assert.match(html, /data-items-modes/);
  assert.match(html, /As an offer to accept/);
  assert.match(html, /Send choices/);
  assert.match(html, /Add to the shared draft only/);
  assert.match(html, /data-items-custom/);
  assert.match(html, /Custom line/);
  // Nothing selected: the footer says so and the send stays disabled.
  assert.match(html, /data-items-total="true">Nothing selected/);
  assert.match(tag(html, "data-items-send"), /disabled=""/);
});

test("state 3b, ready with a selection: count and total in the footer, the ticket row shows its tier chooser with the sold-out tier disabled, send enabled and labelled per mode", () => {
  const html = renderToStaticMarkup(
    <ItemsPickerView
      {...pickerProps({
        selected: [
          { row: TALENT, units: 1 },
          { row: PACKAGE, units: 1 },
          { row: TICKET, units: 2, variantId: "v1" },
        ],
        mode: "choices",
      })}
    />,
  );
  houseRules(html);
  assert.match(html, /3 selected · from \$1,050</);
  assert.match(html, /data-items-tier/);
  assert.match(html, /<option[^>]*value="v2"[^>]*disabled=""/);
  assert.match(html, /40 left/);
  assert.doesNotMatch(tag(html, "data-items-send"), /disabled=""/);
  assert.match(html, /data-items-send="true">Send choices</);
  const draft = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ selected: [{ row: PACKAGE, units: 1 }], mode: "draft" })} />);
  assert.match(draft, /data-items-send="true">Add to draft</);
  assert.match(draft, /1 selected · \$1,000</);
});

test("state 4, busy (sending): the button is busy and says Sending, the rows and the search are disabled", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "busy", selected: [{ row: PACKAGE, units: 1 }] })} />);
  houseRules(html);
  assert.match(html, /data-phase="busy"/);
  assert.match(tag(html, "data-items-send"), /aria-busy="true"/);
  assert.match(html, /data-items-send="true">Sending</);
  assert.match(html, /<input type="search"[^>]*disabled=""/);
  assert.match(html, /data-items-row="package:o1"[^>]*><button type="button" class="opt on off"[^>]*disabled=""/);
});

test("state 5, refused: identity_unconfirmed (a talent hold needs an identity) and unavailable both draw the refusal sentence, never free text", () => {
  for (const code of ["identity_unconfirmed", "unavailable"] as const) {
    const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "refused", refusal: code, selected: [{ row: TALENT, units: 1 }], mode: "choices" })} />);
    houseRules(html);
    assert.match(html, new RegExp(`data-refusal="${code}"`));
    assert.match(html, /role="alert"/);
    assert.equal(html.includes(EN_COPY.refusal(code)), true);
  }
});

test("state 5b, a seam blocks the send with a sentence: tables have no card kind, a custom line is not a choice", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ selected: [{ row: PACKAGE, units: 1 }], seam: EN_COPY.items.tableSeam })} />);
  assert.match(html, /data-items-seam/);
  assert.match(html, /Table choices need a table card/);
  assert.match(tag(html, "data-items-send"), /disabled=""/);
});

test("state 6, done: the ok line per mode", () => {
  const offer = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "done", mode: "offer" })} />);
  assert.match(offer, /data-ok-line/);
  assert.match(offer, /Lines added\. Now the offer/);
  const choices = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "done", mode: "choices" })} />);
  assert.match(choices, /Choices sent/);
  const draft = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ phase: "done", mode: "draft" })} />);
  assert.match(draft, /Added to the shared draft/);
});

test("mobile (M03): the h92 sheet, the short title, mobile chips and rows, one xl button carrying the count and total", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ variant: "mobile", selected: [{ row: PACKAGE, units: 1 }, { row: SERVICE, units: 2 }] })} />);
  houseRules(html);
  assert.match(html, /data-sheet="mobile-h92"/);
  assert.match(html, /<h3[^>]*>Add items<\/h3>/);
  assert.match(html, /class="mx-chips"/);
  assert.match(html, /class="mx-opt2 on"/);
  assert.match(tag(html, "data-items-send"), /class="btn primary xl fill"/);
  assert.match(html, /data-items-send="true">Continue to offer · 2 selected · \$1,090</);
});

test("category narrowing: only the chosen category's rows, no group headers", () => {
  const html = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ category: "package" })} />);
  assert.match(html, /data-items-group="package"/);
  assert.doesNotMatch(html, /data-items-group="talent"/);
  const search = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ query: "mani" })} />);
  assert.match(search, /Manicure/);
  assert.doesNotMatch(search, /Gala Duo/);
});

test("rowSub: when, seats and the busy reason, joined with a middle dot", () => {
  assert.equal(rowSub(TALENT_BUSY, EN_COPY, "2026-09-20", "America/Cancun"), "busy booked Sep 20");
  assert.equal(rowSub(PACKAGE, EN_COPY, null, "UTC"), "5h");
  assert.match(rowSub(TICKET, EN_COPY, null, "America/Cancun") ?? "", /Fri, Oct 9, 10:00 PM · 2 tiers/);
  assert.equal(rowSub({ ...PACKAGE, sub: null, availability: { kind: "busy", reason: "sold_out" } }, EN_COPY, null, "UTC"), "busy sold out");
});

test("ES and FR render the same states with their own words", () => {
  const es = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ copy: ES_COPY })} />);
  houseRules(es);
  assert.match(es, /Agregar artículos a esta conversación/);
  assert.match(es, /Enviar opciones/);
  const fr = renderToStaticMarkup(<ItemsPickerView {...pickerProps({ copy: FR_COPY })} />);
  houseRules(fr);
  assert.match(fr, /Ajouter des articles à cette conversation/);
  assert.match(fr, /Envoyer des choix/);
});

/* ------------------------------------------------------------ times sheet (D09) ------------------------------------------------------------ */

function timesProps(over: Partial<TimesSheetViewProps> = {}): TimesSheetViewProps {
  return {
    open: true,
    onClose: noop,
    copy: EN_COPY,
    variant: "desktop",
    clientName: "Marco Salinas",
    phase: "ready",
    people: [TALENT, TALENT_BUSY],
    services: [SERVICE],
    personId: null,
    offeringId: null,
    slots: null,
    slotsLoading: false,
    picked: [],
    refusal: null,
    onPerson: noop,
    onService: noop,
    onPick: noop,
    onSend: noop,
    ...over,
  };
}

const STARTS = ["2026-09-21T15:00:00Z", "2026-09-21T16:00:00Z", "2026-09-21T17:00:00Z", "2026-09-22T15:00:00Z"];

test("times, loading and no people: skeleton, then the 'add a person first' empty state", () => {
  const loading = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "loading", people: [] })} />);
  houseRules(loading);
  assert.match(loading, /Send times/);
  assert.match(loading, /data-skeleton/);
  const none = renderToStaticMarkup(<TimesSheetView {...timesProps({ people: [] })} />);
  assert.match(none, /Add a person to this conversation first/);
  assert.match(tag(none, "data-times-send"), /disabled=""/);
});

test("times, ready: people as radio rows, service chips, no slots until a person is chosen", () => {
  const html = renderToStaticMarkup(<TimesSheetView {...timesProps()} />);
  houseRules(html);
  assert.match(html, /data-times-people/);
  assert.match(html, /role="radio"[^>]*aria-checked="false"[^>]*>.*Sofía Herrera/);
  assert.match(html, /data-times-services/);
  assert.match(html, /Any service/);
  assert.match(html, /Manicure/);
  assert.doesNotMatch(html, /data-times-slots/);
});

test("times, slots: grouped by day, picked chips pressed, the hint asks for at least 3, then 3 picked enables the send", () => {
  const few = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "slots", personId: "t1", slots: { starts: STARTS, timezone: "America/Cancun", reason: null }, picked: [STARTS[0]] })} />);
  houseRules(few);
  assert.match(few, /data-times-day="Mon, Sep 21"/);
  assert.match(few, /data-times-day="Tue, Sep 22"/);
  assert.match(few, /Pick at least 3/);
  assert.match(few, /aria-pressed="true"[^>]*aria-label="Mon, Sep 21 10:00 AM"/);
  assert.match(few, /data-times-count="true">1 \/ 6</);
  assert.match(tag(few, "data-times-send"), /disabled=""/);
  const ok = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "slots", personId: "t1", slots: { starts: STARTS, timezone: "America/Cancun", reason: null }, picked: STARTS.slice(0, 3) })} />);
  assert.match(ok, /Pick 3 to 6 times/);
  assert.doesNotMatch(tag(ok, "data-times-send"), /disabled=""/);
});

test("times, no free slots: the reason sentence, not a bare empty list", () => {
  const html = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "slots", personId: "t1", slots: { starts: [], timezone: "UTC", reason: "no_booking_hours" } })} />);
  assert.match(html, /No free times in this window/);
  assert.match(html, /This person has no booking hours yet/);
});

test("times, busy / refused / done", () => {
  const busy = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "busy", personId: "t1", slots: { starts: STARTS, timezone: "UTC", reason: null }, picked: STARTS.slice(0, 3) })} />);
  assert.match(tag(busy, "data-times-send"), /aria-busy="true"/);
  assert.match(busy, /data-times-send="true">Sending</);
  const refused = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "refused", refusal: "identity_unconfirmed", personId: "t1" })} />);
  assert.match(refused, /data-refusal="identity_unconfirmed"/);
  const done = renderToStaticMarkup(<TimesSheetView {...timesProps({ phase: "done", personId: "t1" })} />);
  assert.match(done, /data-ok-line/);
  assert.match(done, /Times sent/);
});

/* ------------------------------------------------------------ the send plan against a fake engine ------------------------------------------------------------ */

type Log = string[];

function fakeActions(log: Log, refuseAt: string | null = null): ItemsActions {
  const refuse = (name: string) => refuseAt === name;
  return {
    loadCatalog: async () => ({ ok: true, catalog: CATALOG }),
    loadPersonSlots: async () => ({ ok: true, starts: STARTS, timezone: "UTC", reason: null }),
    currentVersion: async () => {
      log.push("version");
      return 7;
    },
    ensureSharedDraft: async () => {
      log.push("ensure");
      return refuse("ensure") ? { ok: false, reason: "checkout_locked" } : { ok: true, orderId: "ord-1", version: 3 };
    },
    addLine: async (i) => {
      log.push(`line:${i.offeringId}:${i.units}:${i.expectedVersion ?? "-"}:${i.variantId ?? "-"}:${i.sessionId ?? "-"}`);
      return refuse("line") ? { ok: false, reason: "unavailable" } : { ok: true };
    },
    addCustomLine: async (i) => {
      log.push(`custom:${i.label}:${i.amountCents}:${i.idempotencyKey}`);
      return { ok: true };
    },
    addTalent: async (i) => {
      log.push(`talent:${i.talentProfileId}:v${i.expectedVersion}`);
      return refuse("talent") ? { ok: false, reason: "conflict" } : { ok: true };
    },
    sendOptions: async (i) => {
      log.push(`send:${i.kind}`);
      return refuse("send") ? { ok: false, reason: "channel_unavailable" } : { ok: true, messageId: "m1" };
    },
  };
}

const ctx = { inquiryId: "iq-1", version: 5, newKey: () => "key-1" };

test("runSendPlan offer: draft, talent (with the re-read version), lines (the first locked, the rest unlocked), custom line, then create_offer is handed back to dispatch", async () => {
  const log: Log = [];
  const plan = sendModeToEngineCall({
    mode: "offer",
    selected: [
      { row: TALENT, units: 1 },
      { row: PACKAGE, units: 1 },
      { row: TICKET, units: 2, variantId: "v1" },
    ],
    custom: { label: "Sound check", amountCents: 15_000 },
    timezone: "UTC",
  });
  const r = await runSendPlan(plan, fakeActions(log), ctx);
  assert.deepEqual(r, { ok: true, dispatched: "create_offer", sent: 0, added: 4 });
  assert.deepEqual(log, ["ensure", "version", "talent:t1:v7", "line:o1:1:3:-:-", "line:o5:2:-:v1:s2", "custom:Sound check:15000:key-1"]);
});

test("runSendPlan choices: only send_options calls, nothing on the draft, nothing dispatched", async () => {
  const log: Log = [];
  const plan = sendModeToEngineCall({ mode: "choices", selected: [{ row: PACKAGE, units: 1 }, { row: TICKET, units: 1, variantId: "v1" }], custom: null, timezone: "UTC" });
  const r = await runSendPlan(plan, fakeActions(log), ctx);
  assert.deepEqual(r, { ok: true, dispatched: null, sent: 2, added: 0 });
  assert.deepEqual(log, ["send:service_card", "send:tickets_card"]);
});

test("runSendPlan stops at the first refusal and answers its code: a locked checkout, a busy person, a dead channel", async () => {
  const log: Log = [];
  const plan = sendModeToEngineCall({ mode: "draft", selected: [{ row: TALENT, units: 1 }, { row: PACKAGE, units: 1 }], custom: null, timezone: "UTC" });
  assert.deepEqual(await runSendPlan(plan, fakeActions(log, "ensure"), ctx), { ok: false, reason: "checkout_locked" });
  assert.deepEqual(log, ["ensure"]);
  log.length = 0;
  assert.deepEqual(await runSendPlan(plan, fakeActions(log, "talent"), ctx), { ok: false, reason: "conflict" });
  assert.deepEqual(log, ["ensure", "version", "talent:t1:v7"]);
  log.length = 0;
  const choices = sendModeToEngineCall({ mode: "choices", selected: [{ row: PACKAGE, units: 1 }], custom: null, timezone: "UTC" });
  assert.deepEqual(await runSendPlan(choices, fakeActions(log, "send"), ctx), { ok: false, reason: "channel_unavailable" });
});

test("runSendPlan never writes a line without a draft: a plan that skipped ensure_shared_draft is refused as invalid", async () => {
  const log: Log = [];
  const plan: EngineCall[] = [{ action: "add_line", offeringId: "o1", units: 1, label: "x" }];
  assert.deepEqual(await runSendPlan(plan, fakeActions(log), ctx), { ok: false, reason: "invalid" });
  assert.deepEqual(log, []);
});

/* ------------------------------------------------------------ the registry seam ------------------------------------------------------------ */

test("importing the sheets barrel registers add_items and send_times for lane L5", () => {
  assert.equal(registeredActionSheet("add_items")?.lane, "L5");
  assert.equal(registeredActionSheet("send_times")?.lane, "L5");
});
