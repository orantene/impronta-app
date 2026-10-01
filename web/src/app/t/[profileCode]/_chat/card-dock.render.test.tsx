/**
 * The merged guest chat: the card skin on the ONE front-door dock.
 * Components run in jsdom; wiring (which file calls which) is asserted from
 * source. Covers each tab entry point (header icons, tab strip), the chips
 * filling the composer, Agregar firing the add-service event, and
 * "Enviar pedido" calling the dock's existing send action.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTranslator } from "@/i18n/messages";
import { CHAT_ADD_SERVICE_EVENT } from "@/components/public-booking/chat-catalog-events";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";
import { CardDockAskFooter, CardDockIntro } from "./CardDockChatExtras";
import { CardDockFrame } from "./CardDockFrame";
import { CardDockHeader } from "./CardDockHeader";
import { CardDockServicesView } from "./CardDockServicesView";
import { GuestDockChrome } from "./GuestDockChrome";
import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { CARD_SOLID_BG, cardFrameStyle } from "./card-dock-skin";
import { GuestComposerOfferingStrip } from "./GuestComposerOfferingStrip";
import type { GuestDockView } from "./guest-dock-view";
import { C, CARD_PALETTE, paletteFor } from "./mini-chat-styles";
import type { ChatOffering } from "./OfferingQuickPicker";
import { clearPendingOffering, setPendingOffering } from "./pending-offering-store";
/* eslint-enable import/first */

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, rel), "utf8");
const es = createTranslator("es");
const en = createTranslator("en");

function render(node: React.ReactElement) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return {
    host,
    rerender: (next: React.ReactElement) => act(() => root.render(next)),
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const BRAND = { agencyName: "Jor Beauty", talentDisplayName: "Jorgelina", photoUrl: "https://example.test/j.jpg", locale: "es" } as MiniChatBrand;
const CARD: ChatCardConfig = {
  replyLabel: "Responde en minutos",
  city: "Playa del Carmen",
  customGreeting: null,
  browseServices: true,
  colors: { background: null, surface: null, ink: null, muted: null, line: null, accent: null, onAccent: null },
  bodyFont: null,
};
const OFFERING: ChatOffering = {
  offeringId: "o1",
  talentProfileId: "t1",
  title: "Gel pedicure",
  kind: "service",
  priceType: "flat_package",
  amountCents: 30000,
  currency: "MXN",
  durationMinutes: 75,
  allowPayInPerson: true,
  reserveMode: "free",
  depositPct: null,
  imageUrl: null,
};

function header(over: Partial<Parameters<typeof CardDockHeader>[0]> = {}) {
  return (
    <CardDockHeader
      brand={BRAND}
      card={CARD}
      t={es}
      activeView="chat"
      onViewChange={() => undefined}
      showServices
      servicesCount={2}
      projectsCount={3}
      threadState="new"
      syncState="idle"
      onOpenSwitcher={null}
      expanded={false}
      onToggleExpand={() => undefined}
      onClose={() => undefined}
      {...over}
    />
  );
}

// ── header ───────────────────────────────────────────────────────────────────

test("header: photo, name and city on the left; round list, calendar, expand and close on the right", () => {
  const { host, unmount } = render(header());
  assert.match(host.textContent ?? "", /Jorgelina/);
  assert.match(host.textContent ?? "", /Responde en minutos/);
  assert.ok(host.querySelector("img"));
  for (const sel of ["[data-card-dock-services]", "[data-card-dock-bookings]", "[data-card-dock-expand]", 'button[aria-label="Cerrar"]']) {
    assert.ok(host.querySelector(sel), sel);
  }
  unmount();
});

test("header: badges carry the Servicios and Mis citas counts, and vanish at zero", () => {
  const { host, rerender, unmount } = render(header());
  const badges = () => [...host.querySelectorAll("[data-card-dock-badge]")].map((b) => b.textContent);
  assert.deepEqual(badges(), ["2", "3"]);
  rerender(header({ servicesCount: 0, projectsCount: 0 }));
  assert.deepEqual(badges(), []);
  unmount();
});

test("header: the list icon opens Servicios, the calendar opens Mis citas, a second tap returns to Hablar", () => {
  const seen: GuestDockView[] = [];
  const { host, rerender, unmount } = render(header({ onViewChange: (v) => seen.push(v) }));
  act(() => host.querySelector<HTMLButtonElement>("[data-card-dock-services]")!.click());
  act(() => host.querySelector<HTMLButtonElement>("[data-card-dock-bookings]")!.click());
  assert.deepEqual(seen, ["lineup", "projects"]);
  rerender(header({ activeView: "projects", onViewChange: (v) => seen.push(v) }));
  const cal = host.querySelector<HTMLButtonElement>("[data-card-dock-bookings]")!;
  assert.equal(cal.getAttribute("aria-pressed"), "true");
  act(() => cal.click());
  assert.equal(seen.at(-1), "chat");
  unmount();
});

test("header: no dock tabs (no inquiry engine) leaves only expand and close", () => {
  const { host, unmount } = render(header({ onViewChange: undefined }));
  assert.equal(host.querySelector("[data-card-dock-services]"), null);
  assert.equal(host.querySelector("[data-card-dock-bookings]"), null);
  assert.ok(host.querySelector("[data-card-dock-expand]"));
  unmount();
});

test("header: her browse switch off hides the list button; a draft shows the honest status line", () => {
  const { host, unmount } = render(header({ showServices: false, threadState: "draft" }));
  assert.equal(host.querySelector("[data-card-dock-services]"), null);
  assert.match(host.textContent ?? "", new RegExp(es("public.guestChat.headerDraftLine")));
  unmount();
});

// ── navigation (no tab strip) ────────────────────────────────────────────────

function chrome(over: Partial<Parameters<typeof GuestDockChrome>[0]> = {}) {
  return (
    <GuestDockChrome
      brand={BRAND}
      accent="x"
      accentInk="y"
      talentFirst="Jorgelina"
      C={paletteFor("card")}
      surfaceMode="card"
      threadState="new"
      journeyLabel={null}
      syncState="idle"
      expanded={false}
      onOpenSwitcher={null}
      onOpenDetails={null}
      detailsFilled={0}
      detailsTotal={0}
      railLabel={"Falta el d\u00eda"}
      journeySegs={[{ id: "a", on: false, label: "d\u00eda" }]}
      dockEnabled
      activeDockView="chat"
      onDockViewChange={() => undefined}
      lineupCount={0}
      projectsCount={0}
      t={es}
      onClose={() => undefined}
      card={CARD}
      {...over}
    />
  );
}

test("no tab strip: the header icons are the navigation, and the avatar shows in every view", () => {
  for (const activeView of ["chat", "lineup", "projects"] as const) {
    const { host, unmount } = render(chrome({ activeDockView: activeView }));
    assert.equal(host.querySelector('[role="tablist"]'), null, activeView);
    assert.ok(host.querySelector("[data-card-dock-avatar]"), `avatar in ${activeView}`);
    assert.ok(host.querySelector("[data-card-dock-services]") && host.querySelector("[data-card-dock-bookings]"));
    unmount();
  }
});

test("Servicios and Mis citas get a slim back link to the chat; Hablar does not", () => {
  const seen: GuestDockView[] = [];
  const away = render(chrome({ activeDockView: "lineup", onDockViewChange: (v) => seen.push(v) }));
  act(() => away.host.querySelector<HTMLButtonElement>("[data-card-dock-back]")!.click());
  assert.deepEqual(seen, ["chat"]);
  away.unmount();
  const home = render(chrome());
  assert.equal(home.host.querySelector("[data-card-dock-back]"), null);
  home.unmount();
});

test("the progress rail is hidden until there is a selection, then one compact line", () => {
  const none = render(chrome({ lineupCount: 0 }));
  assert.equal(none.host.querySelector("[data-card-dock-rail]"), null);
  assert.equal(none.host.querySelector(".guest-journey-segs"), null);
  none.unmount();
  const one = render(chrome({ lineupCount: 1 }));
  assert.equal(one.host.querySelector("[data-card-dock-rail]")?.textContent, "1 servicio \u00b7 falta el d\u00eda");
  one.unmount();
  const many = render(chrome({ lineupCount: 3 }));
  assert.match(many.host.querySelector("[data-card-dock-rail]")?.textContent ?? "", /^3 servicios/);
  many.unmount();
});

test("expand shows on desktop only (the phone sheet has no expand)", () => {
  const w = dom.window as unknown as { matchMedia?: (q: string) => unknown };
  w.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  const phone = render(header());
  assert.equal(phone.host.querySelector("[data-card-dock-expand]"), null);
  assert.ok(phone.host.querySelector("[data-card-dock-services]") && phone.host.querySelector("[data-card-dock-bookings]"));
  phone.unmount();
  w.matchMedia = () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined });
  const desk = render(header());
  assert.ok(desk.host.querySelector("[data-card-dock-expand]"));
  desk.unmount();
  delete w.matchMedia;
});

test("the subtitle is the reply time when known, else the city", () => {
  const both = render(header());
  assert.equal(both.host.querySelector("small")?.textContent, "Responde en minutos");
  both.unmount();
  const city = render(header({ card: { ...CARD, replyLabel: null } }));
  assert.equal(city.host.querySelector("small")?.textContent, "Playa del Carmen");
  city.unmount();
});

test("Mis citas: empty shows only the empty state with a way to Servicios", () => {
  let browse = 0;
  const { host, unmount } = render(
    <GuestDockProjectsView inquiries={[]} activeInquiryId={null} seenAtByInquiry={{}} accent="#222222" agencyName="Jor Beauty" surfaceMode="card" t={es} onSelect={() => undefined} onBrowseServices={() => browse++} />,
  );
  assert.match(host.textContent ?? "", /A\u00fan no tienes citas\. Elige un servicio para empezar\./);
  assert.equal(host.querySelector('[role="tablist"]'), null, "no filters in the empty state");
  act(() => host.querySelector("button")!.click());
  assert.equal(browse, 1);
  unmount();
});

// ── Hablar ───────────────────────────────────────────────────────────────────

test("Hablar: her greeting renders, the disclaimer is the composer placeholder, and chips FILL the composer without sending", () => {
  const picked: string[] = [];
  const intro = render(<CardDockIntro greeting="Hola, soy Jorgelina" />);
  assert.match(intro.host.textContent ?? "", /Hola, soy Jorgelina/);
  assert.doesNotMatch(intro.host.textContent ?? "", /Nada se env/, "no separate disclaimer line");
  intro.unmount();
  assert.equal(es("public.guestChat.cardComposerPlaceholder"), "Nada se env\u00eda hasta que toques enviar.");
  assert.match(src("MiniChatPanelColumn.tsx"), /cardComposerPlaceholder/);
  clearPendingOffering();
  const { host, unmount } = render(<CardDockAskFooter t={es} threadEmpty onPick={(q) => picked.push(q)} />);
  const row = host.querySelector<HTMLElement>("[data-card-chat-chips]")!;
  assert.equal(row.style.flexWrap, "nowrap", "one scrollable row");
  assert.equal(row.style.overflowX, "auto");
  const chips = row.querySelectorAll<HTMLButtonElement>("button");
  assert.equal(chips.length, 3);
  act(() => chips[0]!.click());
  assert.deepEqual(picked, [es("public.guestChat.askQuickWhen")]);
  unmount();
});

test("Hablar: with a service in context the chips are phrased about it", () => {
  setPendingOffering({ ...OFFERING, intent: "request", askAbout: ["Gel pedicure"] } as never);
  const { host, unmount } = render(<CardDockAskFooter t={es} threadEmpty={false} onPick={() => undefined} />);
  const texts = [...host.querySelectorAll("[data-card-chat-chips] button")].map((b) => b.textContent);
  assert.equal(texts[0], "\u00bfHay hueco esta semana para Gel pedicure?");
  assert.equal(texts[1], "\u00bfCu\u00e1nto dura Gel pedicure?");
  unmount();
  clearPendingOffering();
});

test("Hablar: chips hide once the thread has messages; a staged service shows the context card instead", () => {
  clearPendingOffering();
  const started = render(<CardDockAskFooter t={en} threadEmpty={false} onPick={() => undefined} />);
  assert.equal(started.host.querySelector("[data-card-chat-chips]"), null);
  started.unmount();
  setPendingOffering({ ...OFFERING, intent: "request", askAbout: ["Gel pedicure"] } as never);
  const staged = render(<CardDockAskFooter t={en} threadEmpty={false} onPick={() => undefined} />);
  assert.match(staged.host.querySelector("[data-card-chat-context]")?.textContent ?? "", /Gel pedicure/);
  staged.unmount();
  clearPendingOffering();
});

// ── Servicios ────────────────────────────────────────────────────────────────

test("Servicios: Agregar fires the add-service event and steps the chat aside", () => {
  const events: string[] = [];
  const onEvent = (e: Event) => events.push((e as CustomEvent<{ offeringId: string }>).detail.offeringId);
  dom.window.addEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  let added = 0;
  const { host, unmount } = render(
    <CardDockServicesView offerings={[OFFERING]} locale="es" t={es} selectionCount={0} sending={false} onSend={() => undefined} onBackToChat={() => undefined} onAdded={() => added++} />,
  );
  assert.match(host.textContent ?? "", /Gel pedicure/);
  act(() => host.querySelector<HTMLButtonElement>("[data-card-chat-add]")!.click());
  assert.deepEqual(events, ["o1"]);
  assert.equal(added, 1);
  dom.window.removeEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  unmount();
});

test("Servicios: Preguntar stages the service and returns to Hablar", () => {
  clearPendingOffering();
  let back = 0;
  const { host, unmount } = render(
    <CardDockServicesView offerings={[OFFERING]} locale="es" t={es} selectionCount={0} sending={false} onSend={() => undefined} onBackToChat={() => back++} onAdded={() => undefined} />,
  );
  act(() => host.querySelector<HTMLButtonElement>("[data-card-chat-ask]")!.click());
  assert.equal(back, 1);
  const after = render(<CardDockAskFooter t={es} threadEmpty={false} onPick={() => undefined} />);
  assert.match(after.host.textContent ?? "", /Gel pedicure/);
  after.unmount();
  clearPendingOffering();
  unmount();
});

test("Servicios: 'Enviar pedido · N' appears with a selection and calls the existing send action", () => {
  let sent = 0;
  const empty = render(
    <CardDockServicesView offerings={[]} locale="es" t={es} selectionCount={0} sending={false} onSend={() => sent++} onBackToChat={() => undefined} onAdded={() => undefined} />,
  );
  assert.equal(empty.host.querySelector("[data-card-dock-tray]"), null);
  empty.unmount();
  const { host, unmount } = render(
    <CardDockServicesView offerings={[OFFERING]} locale="es" t={es} selectionCount={2} sending={false} onSend={() => sent++} onBackToChat={() => undefined} onAdded={() => undefined}>
      <p data-slot="">selection shelves and catalog</p>
    </CardDockServicesView>,
  );
  const tray = host.querySelector<HTMLButtonElement>("[data-card-dock-tray] button")!;
  assert.equal(tray.textContent, "Enviar pedido · 2");
  assert.ok(host.querySelector("[data-slot]"), "the dock's own shelves render under her services");
  act(() => tray.click());
  assert.equal(sent, 1);
  unmount();
  const busy = render(
    <CardDockServicesView offerings={[]} locale="en" t={en} selectionCount={1} sending onSend={() => sent++} onBackToChat={() => undefined} onAdded={() => undefined} />,
  );
  assert.equal(busy.host.querySelector<HTMLButtonElement>("[data-card-dock-tray] button")!.disabled, true);
  busy.unmount();
});

// ── frame + skin ─────────────────────────────────────────────────────────────

test("frame: floating card on desktop, bottom sheet on phones, full screen when expanded", () => {
  const desk = cardFrameStyle(false, false, 0);
  assert.equal(desk.right, 24);
  assert.equal(desk.borderRadius, 24);
  const sheet = cardFrameStyle(true, false, 0);
  assert.equal(sheet.left, 0);
  assert.equal(sheet.right, 0);
  assert.equal(sheet.borderRadius, "24px 24px 0 0");
  const full = cardFrameStyle(true, true, 0);
  assert.equal(full.inset, 0);
  assert.equal(cardFrameStyle(true, false, 280).bottom, 280, "the soft keyboard lifts the sheet");
  const wide = cardFrameStyle(false, true, 0);
  assert.notEqual(wide.width, desk.width);
});

test("frame: sets the token vars and the dialog marks, and hides when the booking sheet opens", () => {
  let closed = 0;
  const { host, unmount } = render(
    <CardDockFrame card={CARD} accent="#111111" accentInk="#ffffff" compact={false} expanded={false} keyboardInsetPx={0} ariaLabel="Chat" onClose={() => closed++}>
      <span>inside</span>
    </CardDockFrame>,
  );
  const dlg = host.querySelector<HTMLElement>('[data-chat-variant="card"]')!;
  assert.equal(dlg.getAttribute("role"), "dialog");
  assert.equal(dlg.style.getPropertyValue("--cc-accent"), "#111111");
  assert.match(dlg.style.getPropertyValue("--cc-surface"), /--token-color-surface-raised/);
  act(() => {
    dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:maison-sheet", { detail: { open: true } }));
  });
  assert.equal(closed, 1);
  unmount();
});

test("skin: the card palette reads only --cc vars (dark designs invert it) and keeps every light key", () => {
  assert.deepEqual(Object.keys(CARD_PALETTE), Object.keys(C));
  for (const [k, v] of Object.entries(CARD_PALETTE)) {
    if (k === "danger") continue;
    assert.match(v, /^var\(--cc-/, k);
  }
  assert.equal(paletteFor("card"), CARD_PALETTE);
  assert.equal(paletteFor("light"), C);
});

// ── wiring ───────────────────────────────────────────────────────────────────

test("wiring: one dock, no second chat; the card branch wraps MiniChatPanelColumn", () => {
  const panel = src("MiniChatPanel.tsx");
  assert.match(panel, /<CardDockFrame[^>]*><MiniChatPanelColumn \{\.\.\.columnProps\} card=\{chatCard\}/);
  assert.doesNotMatch(panel, /CardChatPanel/);
  const col = src("MiniChatPanelColumn.tsx");
  assert.match(col, /card=\{card\}/, "the column hands the card to the chrome");
  assert.match(col, /onSend=\{onSendToAgency \?\? startInquiryInChat\}/, "the tray is the existing send action");
  assert.match(col, /<CardDockIntro/);
  assert.match(col, /<CardDockAskFooter/);
  assert.match(col, /<CardDockBackToBooking/);
  const chrome = src("GuestDockChrome.tsx");
  assert.match(chrome, /<CardDockHeader/);
  assert.match(chrome, /<GuestPanelHeader/, "the standard header stays for every non-card mount");
});

test("copy and colours: new strings in en, es, fr; no hex and no dashes in the new files", () => {
  const read = (lang: string) => JSON.parse(readFileSync(join(here, `../../../../../messages/${lang}.json`), "utf8")) as { public: { guestChat: Record<string, string> } };
  for (const lang of ["en", "es", "fr"]) {
    const gc = read(lang).public.guestChat;
    for (const k of ["cardBookingsAria", "cardSendOrder", "cardPillTop", "cardPricesIn", "cardAskQuote", "cardAddService", "cardRailOne", "cardRailMany", "cardComposerPlaceholder", "cardNoBookings", "cardSeeServices", "cardChipWhenFor", "cardChipDurationFor"]) {
      assert.ok(gc[k], `${lang}.${k}`);
      assert.doesNotMatch(gc[k]!, /[–—]/, `${lang}.${k} has no dashes`);
    }
  }
  for (const f of ["CardDockHeader.tsx", "CardDockFrame.tsx", "CardDockServicesView.tsx", "CardDockChatExtras.tsx", "card-dock-skin.ts"]) {
    assert.doesNotMatch(src(f), /#[0-9a-fA-F]{3,8}\b/, `${f} has no hex`);
    assert.doesNotMatch(src(f), /[–—]/, `${f} has no em or en dashes`);
  }
});

const MENU = [
  { title: "Pesta\u00f1as A", category: "Pesta\u00f1as", priceLabel: "$500 MXN \u00b7 \u2248 US$28", currency: "MXN", cta: "book_now" as const },
  { title: "U\u00f1as B", category: "U\u00f1as", priceLabel: "$300 MXN \u00b7 \u2248 US$17", currency: "MXN", cta: "request_to_book" as const },
  { title: "Cejas C", category: "Cejas", priceLabel: "$200 MXN \u00b7 \u2248 US$11", currency: "MXN", cta: "book_now" as const },
  { title: "Novia D", category: "Pesta\u00f1as", priceLabel: null, currency: "MXN", cta: "ask_quote" as const },
];
const OFFS = MENU.map((m, i) => ({ ...OFFERING, offeringId: `o${i}`, title: m.title, imageUrl: i === 0 ? "https://example.test/a.jpg" : null }));
function services(locale: "es" | "en", extra: Partial<Parameters<typeof CardDockServicesView>[0]> = {}) {
  return (
    <CardDockServicesView offerings={OFFS} locale={locale} t={locale === "es" ? es : en} selectionCount={0} sending={false} onSend={() => undefined} onBackToChat={() => undefined} onAdded={() => undefined} menu={MENU} {...extra} />
  );
}

test("Servicios: ONE list, 'M\u00e1s pedido' first and selected (her first three), categories filter it, nothing twice", () => {
  const { host, unmount } = render(services("es"));
  const pills = [...host.querySelectorAll<HTMLButtonElement>("[data-card-dock-pills] button")];
  assert.deepEqual(pills.map((p) => p.textContent), ["M\u00e1s pedido", "Pesta\u00f1as", "U\u00f1as", "Cejas"]);
  assert.equal(pills[0]!.getAttribute("aria-pressed"), "true");
  const titles = () => [...host.querySelectorAll("[data-card-chat-service] b")].map((b) => b.textContent);
  assert.deepEqual(titles(), ["Pesta\u00f1as A", "U\u00f1as B", "Cejas C"]);
  act(() => pills[1]!.click());
  assert.deepEqual(titles(), ["Pesta\u00f1as A", "Novia D"]);
  assert.equal(new Set(titles()).size, titles().length, "no service twice");
  assert.equal(host.querySelectorAll("[data-card-dock-catalog]").length, 0);
  unmount();
});

test("Servicios: each row has a thumbnail or icon tile, the price, and one primary pill whose verb follows the menu", () => {
  const { host, unmount } = render(services("es"));
  const row = host.querySelector("[data-card-chat-service]")!;
  assert.ok(row.querySelector("img"), "photo when she has one");
  assert.ok(host.querySelectorAll("[data-card-dock-thumb]").length >= 1, "icon tile otherwise");
  assert.equal(host.querySelectorAll("[data-card-chat-service]").length, 3);
  assert.equal(row.querySelectorAll("[data-card-chat-add]").length, 1, "one primary pill");
  assert.equal(row.querySelector("[data-card-chat-add]")?.textContent, "Agregar");
  assert.doesNotMatch(host.textContent ?? "", /Guardar/);
  const pills = [...host.querySelectorAll<HTMLButtonElement>("[data-card-dock-pills] button")];
  act(() => pills[1]!.click());
  const adds = [...host.querySelectorAll("[data-card-chat-add]")].map((b) => b.textContent);
  assert.deepEqual(adds, ["Agregar", "Pedir cotizaci\u00f3n"]);
  unmount();
});

test("Servicios: a Spanish visitor sees prices in MXN with one note and no US$ line; an English visitor sees US$", () => {
  const e = render(services("es"));
  assert.match(e.host.querySelector("[data-card-dock-currency-note]")?.textContent ?? "", /Precios en MXN/);
  assert.match(e.host.textContent ?? "", /\$500 MXN/);
  assert.doesNotMatch(e.host.textContent ?? "", /US\$/);
  e.unmount();
  const n = render(services("en"));
  assert.equal(n.host.querySelector("[data-card-dock-currency-note]"), null);
  assert.match(n.host.textContent ?? "", /\u2248 US\$28/);
  n.unmount();
});

// ── round 2 defects ──────────────────────────────────────────────────────────

test("one context card: with the card skin the dock strip draws none, the footer draws exactly one", () => {
  setPendingOffering({ ...OFFERING, intent: "request", askAbout: ["Gel semipermanente"] } as never);
  const strip = (hide: boolean) => (
    <GuestComposerOfferingStrip
      showGate={false}
      offerPreview={false}
      threadStatus={"open" as never}
      offerings={[]}
      onDraftChange={() => undefined}
      draft=""
      locale="es"
      t={es}
      accent="x"
      hideAskCard={hide}
    />
  );
  const both = render(
    <>
      {strip(true)}
      <CardDockAskFooter t={es} threadEmpty={false} onPick={() => undefined} />
    </>,
  );
  assert.equal(both.host.querySelectorAll("[data-card-chat-context]").length, 1);
  assert.equal(both.host.querySelectorAll("[data-card-chat-chips]").length, 1);
  both.unmount();
  const standard = render(strip(false));
  assert.ok(standard.host.textContent?.includes("Gel semipermanente"), "the standard dock still draws its own card");
  standard.unmount();
  clearPendingOffering();
});

test("the avatar shows in every view, and falls back to her initial without a photo", () => {
  for (const activeView of ["chat", "lineup", "projects"] as const) {
    const { host, unmount } = render(header({ activeView }));
    assert.ok(host.querySelector("img[data-card-dock-avatar]"), activeView);
    unmount();
  }
  const bare = render(header({ brand: { ...BRAND, photoUrl: null, logoUrl: null } as MiniChatBrand }));
  const mono = bare.host.querySelector("[data-card-dock-avatar]");
  assert.equal(mono?.tagName, "SPAN");
  assert.equal(mono?.textContent, "J");
  bare.unmount();
});

test("the sheet is opaque: a solid base sits under the token surface", () => {
  assert.match(CARD_SOLID_BG, /linear-gradient\(var\(--cc-surface\), var\(--cc-surface\)\), /);
  for (const compact of [false, true]) assert.equal(cardFrameStyle(compact, false, 0).background, CARD_SOLID_BG);
  assert.match(src("GuestConversationBody.tsx"), /cardIntro \? CARD_SOLID_BG/, "the scroll body is opaque too");
});

test("the composer opens empty: the card skin ignores the booking-sheet draft prefix", () => {
  assert.match(src("MiniChatPanel.tsx"), /h\.draftPrefix && !chatCard/);
});


test("phone sheet: a drag handle while it is a sheet, full height only while typing", () => {
  const { host, unmount } = render(
    <CardDockFrame card={CARD} accent="#111111" accentInk="#ffffff" compact expanded={false} keyboardInsetPx={0} ariaLabel="Chat" onClose={() => undefined}>
      <textarea />
    </CardDockFrame>,
  );
  const dlg = host.querySelector<HTMLElement>('[data-chat-variant="card"]')!;
  assert.ok(host.querySelector("[data-card-dock-handle]"));
  assert.match(String(cardFrameStyle(true, false, 0).height), /85dvh/);
  const ta = host.querySelector("textarea")!;
  act(() => {
    ta.dispatchEvent(new dom.window.FocusEvent("focusin", { bubbles: true }));
  });
  assert.equal(host.querySelector("[data-card-dock-handle]"), null);
  assert.equal(cardFrameStyle(true, true, 0).height, undefined, "typing: full screen, inset 0, no fixed height");
  act(() => {
    ta.dispatchEvent(new dom.window.FocusEvent("focusout", { bubbles: true }));
  });
  assert.ok(host.querySelector("[data-card-dock-handle]"), "the handle is back once she stops typing");
  assert.ok(dlg);
  unmount();
});
