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
import { GuestDockNav } from "./GuestDockNav";
import { GuestDockProjectsView } from "./GuestDockProjectsView";
import { cardFrameStyle } from "./card-dock-skin";
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
  assert.match(host.textContent ?? "", /Playa del Carmen/);
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

// ── tabs ─────────────────────────────────────────────────────────────────────

test("tabs: Hablar, Servicios and Mis citas, with count badges, and a tap switches the view", () => {
  const seen: GuestDockView[] = [];
  const { host, unmount } = render(
    <GuestDockNav active="lineup" onChange={(v) => seen.push(v)} accent="x" C={paletteFor("card")} t={es} lineupCount={2} projectsCount={4} itemsLabel={es("public.guestChat.cardTabServices")} />,
  );
  const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  assert.deepEqual(tabs.map((t) => t.getAttribute("aria-label")), ["Hablar", "Servicios", "Mis citas"]);
  assert.match(tabs[1]!.textContent ?? "", /2/);
  assert.match(tabs[2]!.textContent ?? "", /4/);
  act(() => tabs[0]!.click());
  act(() => tabs[2]!.click());
  assert.deepEqual(seen, ["chat", "projects"]);
  unmount();
});

test("Mis citas: an empty list still renders the card-skinned view", () => {
  const { host, unmount } = render(
    <GuestDockProjectsView inquiries={[]} activeInquiryId={null} seenAtByInquiry={{}} accent="x" agencyName="Jor Beauty" surfaceMode="card" t={es} onSelect={() => undefined} />,
  );
  assert.ok(host.firstElementChild, "renders something");
  unmount();
});

// ── Hablar ───────────────────────────────────────────────────────────────────

test("Hablar: the note line and her greeting render, and chips FILL the composer without sending", () => {
  const picked: string[] = [];
  const intro = render(<CardDockIntro t={es} name="Jorgelina" greeting="Hola, soy Jorgelina" />);
  assert.match(intro.host.textContent ?? "", /Escríbele a Jorgelina\. Nada se envía hasta que toques enviar\./);
  assert.match(intro.host.textContent ?? "", /Hola, soy Jorgelina/);
  intro.unmount();
  clearPendingOffering();
  const { host, unmount } = render(<CardDockAskFooter t={es} threadEmpty onPick={(q) => picked.push(q)} />);
  const chips = host.querySelectorAll<HTMLButtonElement>("[data-card-chat-chips] button");
  assert.equal(chips.length, 3);
  act(() => chips[0]!.click());
  assert.deepEqual(picked, [es("public.guestChat.askQuickWhen")]);
  unmount();
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
    for (const k of ["cardBookingsAria", "cardTabServices", "cardSendOrder", "cardMostRequested", "cardSave"]) {
      assert.ok(gc[k], `${lang}.${k}`);
      assert.doesNotMatch(gc[k]!, /[–—]/, `${lang}.${k} has no dashes`);
    }
  }
  for (const f of ["CardDockHeader.tsx", "CardDockFrame.tsx", "CardDockServicesView.tsx", "CardDockChatExtras.tsx", "card-dock-skin.ts"]) {
    assert.doesNotMatch(src(f), /#[0-9a-fA-F]{3,8}\b/, `${f} has no hex`);
    assert.doesNotMatch(src(f), /[–—]/, `${f} has no em or en dashes`);
  }
});

test("Servicios: 'Lo más pedido' shows her first three, with the menu's price line and Guardar", () => {
  const events: string[] = [];
  const onEvent = (e: Event) => events.push((e as CustomEvent<{ offeringId: string }>).detail.offeringId);
  dom.window.addEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  const many = ["a", "b", "c", "d"].map((id) => ({ ...OFFERING, offeringId: id, title: `Servicio ${id}` }));
  const { host, unmount } = render(
    <CardDockServicesView
      offerings={many}
      locale="es"
      t={es}
      selectionCount={0}
      sending={false}
      onSend={() => undefined}
      onBackToChat={() => undefined}
      onAdded={() => undefined}
      menu={[{ title: "Servicio a", priceLabel: "$500 MXN \u00b7 \u2248 US$28" }]}
    />,
  );
  assert.match(host.querySelector("[data-card-dock-heading]")?.textContent ?? "", /Lo más pedido/);
  assert.equal(host.querySelectorAll("[data-card-chat-service]").length, 3);
  assert.match(host.textContent ?? "", /\$500 MXN \u00b7 \u2248 US\$28/);
  const save = host.querySelector<HTMLButtonElement>("[data-card-chat-add]")!;
  assert.equal(save.textContent, "Guardar");
  act(() => save.click());
  assert.deepEqual(events, ["a"]);
  dom.window.removeEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  unmount();
});
