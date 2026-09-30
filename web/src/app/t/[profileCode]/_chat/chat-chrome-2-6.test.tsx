/**
 * Slice 2.6 "chrome", chat side: the card chat's context card + quick
 * questions (CH-2), the way back to the booking (CH-3), services inside the
 * chat (CH-4), and the help bubble (DK-3). Components run in jsdom; the
 * wiring (which file calls which) is asserted from source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { mock } from "node:test";
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
import {
  BOOKING_RESUME_EVENT,
  clearBookingResume,
  peekBookingResume,
  requestBookingResume,
  setBookingResume,
  subscribeBookingResume,
} from "@/components/public-booking/booking-resume-store";
import { CHAT_ADD_SERVICE_EVENT, requestChatAddService } from "@/components/public-booking/chat-catalog-events";
import {
  CARD_CHAT_CSS,
  CardChatBackToBooking,
  CardChatChips,
  CardChatContextCard,
  CardChatServiceBrowser,
} from "./CardChatExtras";
import { ChatHelpBubble, HELP_BUBBLE_CSS } from "./ChatHelpBubble";
import {
  HELP_BUBBLE_SCROLL_PX,
  HELP_BUBBLE_VISIBLE_MS,
  helpBubbleBlocked,
  helpBubbleSessionKey,
  markHelpBubbleSeen,
  readHelpBubbleSeen,
  shouldShowHelpBubble,
} from "./help-bubble-logic";
import { resolveChatHelpBubble } from "@/lib/talent-site/chat-card";
import type { ChatOffering } from "./OfferingQuickPicker";
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

const OFFERINGS: ChatOffering[] = [
  {
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
  },
  {
    offeringId: "o2",
    talentProfileId: "t1",
    title: "Bridal trial",
    kind: "service",
    priceType: "quote",
    amountCents: null,
    currency: "MXN",
    durationMinutes: null,
    allowPayInPerson: true,
    reserveMode: "free",
    depositPct: null,
    imageUrl: null,
  },
];

// ── CH-2: context card + suggestion chips ────────────────────────────────────

test("CH-2 the chips fill the composer with the translated question and never send", () => {
  const picked: string[] = [];
  const { host, unmount } = render(<CardChatChips t={es} onPick={(q) => picked.push(q)} />);
  const chips = host.querySelectorAll<HTMLButtonElement>("button");
  assert.equal(chips.length, 3);
  act(() => chips[0]!.click());
  assert.deepEqual(picked, [es("public.guestChat.askQuickWhen")]);
  assert.match(chips[2]!.textContent ?? "", /¿|cambiar/i);
  unmount();
});

test("CH-2 the context card names the service, can be removed, and carries the chips", () => {
  let cleared = 0;
  const picked: string[] = [];
  const { host, unmount } = render(
    <CardChatContextCard titles={["Gel pedicure"]} imageUrl={null} t={en} onClear={() => cleared++} onPick={(q) => picked.push(q)} />,
  );
  const card = host.querySelector("[data-card-chat-context]")!;
  assert.match(card.textContent ?? "", /Gel pedicure/);
  assert.match(card.textContent ?? "", /Asking about/);
  assert.equal(card.querySelectorAll("[data-card-chat-chips] button").length, 3);
  act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Clear service"]')!.click());
  assert.equal(cleared, 1);
  act(() => card.querySelector<HTMLButtonElement>("[data-card-chat-chips] button")!.click());
  assert.equal(picked.length, 1);
  unmount();
});

// ── CH-3: back to my booking ─────────────────────────────────────────────────

test("CH-3 the store keeps what she was building and tells subscribers", () => {
  clearBookingResume();
  assert.equal(peekBookingResume(), null);
  let hits = 0;
  const off = subscribeBookingResume(() => hits++);
  const detail = { offeringId: "o1", title: "Gel pedicure" } as never;
  setBookingResume({ detail, step: "who", title: "Gel pedicure", totalCents: 30000, currency: "MXN" });
  assert.equal(peekBookingResume()?.step, "who");
  assert.equal(hits, 1);
  clearBookingResume();
  assert.equal(peekBookingResume(), null);
  assert.equal(hits, 2);
  clearBookingResume();
  assert.equal(hits, 2, "clearing an empty store is silent");
  off();
});

test("CH-3 asking to resume fires the event only when something was stashed", () => {
  let fired = 0;
  const onEvent = () => fired++;
  dom.window.addEventListener(BOOKING_RESUME_EVENT, onEvent);
  clearBookingResume();
  requestBookingResume();
  assert.equal(fired, 0);
  setBookingResume({ detail: {} as never, step: "when", title: "x", totalCents: null, currency: "MXN" });
  requestBookingResume();
  assert.equal(fired, 1);
  clearBookingResume();
  dom.window.removeEventListener(BOOKING_RESUME_EVENT, onEvent);
});

test("CH-3 the strip reads 'Volver a mi reserva · service, total' and goes back on tap", () => {
  let backs = 0;
  const snap = { detail: {} as never, step: "who" as const, title: "Gel pedicure", totalCents: 30000, currency: "MXN" };
  const { host, unmount } = render(<CardChatBackToBooking resume={snap} locale="es" t={es} onBack={() => backs++} />);
  const strip = host.querySelector<HTMLButtonElement>("[data-card-chat-back-to-booking]")!;
  assert.match(strip.textContent ?? "", /Volver a mi reserva/);
  assert.match(strip.textContent ?? "", /Gel pedicure, /);
  assert.match(strip.textContent ?? "", /300/);
  act(() => strip.click());
  assert.equal(backs, 1);
  unmount();
  // A quote has no total to show.
  const q = render(<CardChatBackToBooking resume={{ ...snap, totalCents: null }} locale="en" t={en} onBack={() => undefined} />);
  assert.match(q.host.textContent ?? "", /Back to my booking · Gel pedicure$/);
  q.unmount();
});

// ── CH-4: services inside the chat ───────────────────────────────────────────

test("CH-4 the in-chat list shows each service with Add and Ask, and a way back", () => {
  const log: string[] = [];
  const { host, unmount } = render(
    <CardChatServiceBrowser
      offerings={OFFERINGS}
      locale="es"
      t={es}
      onAdd={(o) => log.push(`add:${o.offeringId}`)}
      onAsk={(o) => log.push(`ask:${o.offeringId}`)}
      onBack={() => log.push("back")}
    />,
  );
  const rows = host.querySelectorAll("[data-card-chat-service]");
  assert.equal(rows.length, 2);
  assert.match(rows[0]!.textContent ?? "", /75 min/);
  assert.match(rows[1]!.textContent ?? "", /A cotizar/, "a quote never paints as $0");
  act(() => rows[0]!.querySelector<HTMLButtonElement>("[data-card-chat-add]")!.click());
  act(() => rows[1]!.querySelector<HTMLButtonElement>("[data-card-chat-ask]")!.click());
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  assert.deepEqual(log, ["add:o1", "ask:o2", "back"]);
  assert.match(host.textContent ?? "", /Volver al chat/);
  assert.equal(host.querySelector("[data-card-chat-add]")!.textContent, "Agregar");
  unmount();
});

test("CH-4 an empty catalog says so instead of showing a blank panel", () => {
  const { host, unmount } = render(
    <CardChatServiceBrowser offerings={[]} locale="en" t={en} onAdd={() => undefined} onAsk={() => undefined} onBack={() => undefined} />,
  );
  assert.match(host.textContent ?? "", /No services to show yet/);
  unmount();
});

test("CH-4 asking the page to add a service is one event the catalog island owns", () => {
  const got: string[] = [];
  const onEvent = (e: Event) => got.push((e as CustomEvent<{ offeringId: string }>).detail.offeringId);
  dom.window.addEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  requestChatAddService("o1");
  dom.window.removeEventListener(CHAT_ADD_SERVICE_EVENT, onEvent);
  assert.deepEqual(got, ["o1"]);
  const island = readFileSync(join(here, "../../../../lib/site-admin/builder-node/services-catalog-filter.tsx"), "utf8");
  assert.match(island, /useChatAddService\(/);
  assert.match(island, /useDockToast\(\)/);
});

test("CH wiring: the card chat no longer closes itself to scroll to #services", () => {
  const col = src("CardChatColumn.tsx");
  assert.doesNotMatch(col, /getElementById\("services"\)/);
  assert.doesNotMatch(col, /seeServices/);
  assert.match(col, /<CardChatServiceBrowser/);
  assert.match(col, /<CardChatBackToBooking/);
  assert.match(col, /<CardChatContextCard/);
  assert.match(col, /card\.browseServices/, "her browse switch hides the list button");
  assert.match(col, /requestChatAddService/);
  assert.match(col, /requestBookingResume/);
  // The sheet stashes where she left and re-opens from it with picks kept.
  const sheet = readFileSync(join(here, "../../../../components/public-booking/CatalogBookingSheet.tsx"), "utf8");
  assert.match(sheet, /setBookingResume\(/);
  assert.match(sheet, /addEventListener\(BOOKING_RESUME_EVENT/);
  assert.match(sheet, /clearBookingResume\(\)/);
});

test("CH motion: the card rises in .25s and stands still under reduced motion", () => {
  assert.match(CARD_CHAT_CSS, /animation:cc-up \.25s cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(CARD_CHAT_CSS, /prefers-reduced-motion:reduce\)\{\[data-chat-variant="card"\]\{animation:none\}/);
});

test("CH copy: every new string exists in en, es and fr, without dashes", () => {
  const keys = [
    "cardBackToBooking",
    "cardBrowseBack",
    "cardBrowseAdd",
    "cardBrowseAsk",
    "cardBrowseAddAria",
    "cardBrowseAskAria",
    "cardBrowseQuote",
    "cardBrowseEmpty",
    "helpBubbleTitle",
    "helpBubbleDismiss",
  ];
  for (const loc of ["en", "es", "fr"]) {
    const gc = (JSON.parse(readFileSync(join(here, "../../../../../messages", `${loc}.json`), "utf8")) as {
      public: { guestChat: Record<string, string> };
    }).public.guestChat;
    for (const k of keys) {
      assert.ok(gc[k] && gc[k]!.length > 0, `${loc}: missing ${k}`);
      assert.doesNotMatch(gc[k]!, /—|–/, `${loc}: dash in ${k}`);
    }
  }
});

// ── DK-3: the help bubble ────────────────────────────────────────────────────

test("DK-3 rules: 520px, once per visit, never while something else owns the corner", () => {
  assert.equal(HELP_BUBBLE_SCROLL_PX, 520);
  assert.equal(HELP_BUBBLE_VISIBLE_MS, 9000);
  assert.equal(shouldShowHelpBubble({ scrollY: 519, seen: false, blocked: false }), false);
  assert.equal(shouldShowHelpBubble({ scrollY: 520, seen: false, blocked: false }), true);
  assert.equal(shouldShowHelpBubble({ scrollY: 900, seen: true, blocked: false }), false);
  assert.equal(shouldShowHelpBubble({ scrollY: 900, seen: false, blocked: true }), false);
  assert.equal(helpBubbleBlocked({ chatOpen: false, sheetOpen: false, dockUp: false }), false);
  for (const one of ["chatOpen", "sheetOpen", "dockUp"] as const) {
    assert.equal(helpBubbleBlocked({ chatOpen: false, sheetOpen: false, dockUp: false, [one]: true }), true, one);
  }
});

test("DK-3 the session flag survives unreadable storage", () => {
  const key = helpBubbleSessionKey("TAL-1");
  const store = new Map<string, string>();
  const ok = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readHelpBubbleSeen(ok, key), false);
  markHelpBubbleSeen(ok, key);
  assert.equal(readHelpBubbleSeen(ok, key), true);
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readHelpBubbleSeen(broken, key), false);
  assert.doesNotThrow(() => markHelpBubbleSeen(broken, key));
  assert.equal(readHelpBubbleSeen(null, key), false);
});

function setScroll(y: number) {
  Object.defineProperty(dom.window, "scrollY", { value: y, configurable: true });
  act(() => void dom.window.dispatchEvent(new dom.window.Event("scroll")));
}

function bubble(props: Partial<React.ComponentProps<typeof ChatHelpBubble>> = {}, opened: { n: number } = { n: 0 }) {
  return (
    <ChatHelpBubble
      profileCode="TAL-1"
      name="Alba"
      photoUrl="https://example.test/alba.jpg"
      t={es}
      chatOpen={false}
      dockUp={false}
      onOpenChat={() => opened.n++}
      {...props}
    />
  );
}

test("DK-3 the bubble appears after the scroll threshold, once, and opens the chat", () => {
  dom.window.sessionStorage.clear();
  Object.defineProperty(dom.window, "scrollY", { value: 0, configurable: true });
  const opened = { n: 0 };
  const a = render(bubble({}, opened));
  assert.equal(a.host.querySelector("[data-help-bubble]"), null, "not before the threshold");
  setScroll(400);
  assert.equal(a.host.querySelector("[data-help-bubble]"), null);
  setScroll(600);
  const el = a.host.querySelector("[data-help-bubble]")!;
  assert.ok(el, "shows after 520px");
  assert.match(el.textContent ?? "", /Alba/);
  assert.match(el.textContent ?? "", /¿Te ayudo a elegir\?/);
  assert.equal(dom.window.sessionStorage.getItem(helpBubbleSessionKey("TAL-1")), "1", "the flag is set as it shows");
  act(() => el.querySelector<HTMLButtonElement>(".tl-hello-b")!.click());
  assert.equal(opened.n, 1, "the whole bubble opens the chat");
  assert.equal(a.host.querySelector("[data-help-bubble]"), null, "and goes away");
  a.unmount();

  // A second mount in the same visit never shows it again.
  const b = render(bubble());
  setScroll(1200);
  assert.equal(b.host.querySelector("[data-help-bubble]"), null, "once per visit");
  b.unmount();
});

test("DK-3 the bubble hides itself after 9 seconds, and x dismisses it", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    dom.window.sessionStorage.clear();
    Object.defineProperty(dom.window, "scrollY", { value: 0, configurable: true });
    const a = render(bubble());
    setScroll(700);
    assert.ok(a.host.querySelector("[data-help-bubble]"));
    act(() => mock.timers.tick(HELP_BUBBLE_VISIBLE_MS - 1));
    assert.ok(a.host.querySelector("[data-help-bubble]"), "still there just before 9s");
    act(() => mock.timers.tick(2));
    assert.equal(a.host.querySelector("[data-help-bubble]"), null, "gone after 9s");
    a.unmount();

    dom.window.sessionStorage.clear();
    const b = render(bubble());
    setScroll(800);
    act(() => b.host.querySelector<HTMLButtonElement>(".tl-hello-x")!.click());
    assert.equal(b.host.querySelector("[data-help-bubble]"), null, "x dismisses");
    b.unmount();
  } finally {
    mock.timers.reset();
  }
});

test("DK-3 it never shows, and hides at once, while the chat is open or the dock has the button", () => {
  dom.window.sessionStorage.clear();
  Object.defineProperty(dom.window, "scrollY", { value: 0, configurable: true });
  const a = render(bubble({ chatOpen: true }));
  setScroll(900);
  assert.equal(a.host.querySelector("[data-help-bubble]"), null, "chat open");
  assert.equal(dom.window.sessionStorage.getItem(helpBubbleSessionKey("TAL-1")), null, "a blocked bubble does not use up the visit");
  a.unmount();

  dom.window.sessionStorage.clear();
  const b = render(bubble());
  setScroll(900);
  assert.ok(b.host.querySelector("[data-help-bubble]"));
  b.rerender(bubble({ dockUp: true }));
  assert.equal(b.host.querySelector("[data-help-bubble]"), null, "the dock took over the button");
  b.unmount();

  dom.window.sessionStorage.clear();
  const c = render(bubble());
  setScroll(900);
  assert.ok(c.host.querySelector("[data-help-bubble]"));
  act(() => void dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:maison-sheet", { detail: { open: true } })));
  assert.equal(c.host.querySelector("[data-help-bubble]"), null, "the booking sheet opened");
  c.unmount();
});

test("DK-3 motion: the entrance is .45s with overshoot and is off under reduced motion; no hex", () => {
  assert.match(HELP_BUBBLE_CSS, /animation:tl-hello-in \.45s cubic-bezier\(\.2,1\.3,\.3,1\)/);
  assert.match(HELP_BUBBLE_CSS, /prefers-reduced-motion:reduce\)\{\.tl-hello\{animation:none\}/);
  assert.doesNotMatch(HELP_BUBBLE_CSS, /#[0-9a-fA-F]{3,8}\b/);
});

test("DK-3 switches: a site token turns it on, Maison v2 turns it on from v20 only, nothing else does", () => {
  assert.equal(resolveChatHelpBubble({ "chat.help-bubble": "on" }, null, null), true);
  assert.equal(resolveChatHelpBubble({ "chat.help-bubble": "off" }, "maison-v2", 20), false, "her choice beats the Design default");
  assert.equal(resolveChatHelpBubble({}, "maison-v2", 20), true);
  assert.equal(resolveChatHelpBubble({}, "maison-v2", 21), true);
  assert.equal(resolveChatHelpBubble({}, "maison-v2", 18), false, "a live site changes only when it applies the release");
  assert.equal(resolveChatHelpBubble({}, "maison-v2", null), false);
  assert.equal(resolveChatHelpBubble(null, "folio", 20), false);
  assert.equal(resolveChatHelpBubble(undefined, undefined, undefined), false);
  assert.equal(resolveChatHelpBubble({ "chat.help-bubble": "maybe" }, null, null), false);
});

test("DK-3 wiring: token registry, projection, theme drawer, launcher, mount and dock pass it through", () => {
  const root = join(here, "../../../..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  assert.match(read("lib/site-admin/tokens/registry.ts"), /"chat\.help-bubble": \{/);
  assert.match(read("lib/site-admin/tokens/resolve.ts"), /"chat\.help-bubble": "data-token-chat-help-bubble"/);
  assert.match(read("components/edit-chrome/theme-drawer.tsx"), /key: "chat\.help-bubble"/);
  assert.match(read("components/edit-chrome/editor-i18n-es-inspectors.ts"), /"Help bubble": "Burbuja de ayuda"/);
  const launcher = src("TalentProfileChatLauncher.tsx");
  assert.match(launcher, /helpBubble \? \(|helpBubble && !open/);
  assert.match(launcher, /<ChatHelpBubble/);
  assert.match(launcher, /setChatPresence\(/);
  assert.match(src("TalentProfileChatLauncherMount.tsx"), /helpBubble=\{helpBubble\}/);
  assert.match(read("app/%5Ftalent-site/TalentSiteMessagesDock.tsx"), /helpBubble=\{resolveChatHelpBubble\(siteChrome\.tokens, siteChrome\.designSlug, siteChrome\.designVersion\)\}/);
});
