/**
 * The once-per-visit help bubble ("¿Te ayudo a elegir?"): rules, behaviour in
 * jsdom (anchored to the dock's chat icon with or without a selection, to the
 * idle bar's, or to the floating button), accessibility, and the look.
 */
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://example.test/" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const k of ["HTMLElement", "Element", "Node", "Event", "CustomEvent", "MutationObserver"]) g[k] = (dom.window as never)[k];
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTranslator } from "@/i18n/messages";
import { ChatHelpBubble, HELP_BUBBLE_CSS } from "./ChatHelpBubble";
import {
  HELP_BUBBLE_SCROLL_PX,
  HELP_BUBBLE_VISIBLE_MS,
  findHelpBubbleAnchor,
  helpBubbleBlocked,
  helpBubbleInitials,
  helpBubbleSessionKey,
  markHelpBubbleSeen,
  readHelpBubbleSeen,
  resetHelpBubbleMemory,
  shouldShowHelpBubble,
} from "./help-bubble-logic";
/* eslint-enable import/first */

const es = createTranslator("es");
const en = createTranslator("en");
const doc = dom.window.document;

// ── Rules ────────────────────────────────────────────────────────────────────

test("rules: 520px, once per visit, never while the chat or a sheet is open; the dock is not a blocker", () => {
  assert.equal(HELP_BUBBLE_SCROLL_PX, 520);
  assert.equal(HELP_BUBBLE_VISIBLE_MS, 9000);
  assert.equal(shouldShowHelpBubble({ scrollY: 519, seen: false, blocked: false }), false);
  assert.equal(shouldShowHelpBubble({ scrollY: 520, seen: false, blocked: false }), true);
  assert.equal(shouldShowHelpBubble({ scrollY: 900, seen: true, blocked: false }), false);
  assert.equal(shouldShowHelpBubble({ scrollY: 900, seen: false, blocked: true }), false);
  assert.equal(helpBubbleBlocked({ chatOpen: false, sheetOpen: false }), false);
  assert.equal(helpBubbleBlocked({ chatOpen: true, sheetOpen: false }), true);
  assert.equal(helpBubbleBlocked({ chatOpen: false, sheetOpen: true }), true);
});

test("the visit flag lives in sessionStorage, and falls back to once per page load when storage fails", () => {
  resetHelpBubbleMemory();
  const key = helpBubbleSessionKey("TAL-1");
  const store = new Map<string, string>();
  const ok = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readHelpBubbleSeen(ok, key), false);
  markHelpBubbleSeen(ok, key);
  assert.equal(readHelpBubbleSeen(ok, key), true);

  resetHelpBubbleMemory();
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
  assert.equal(readHelpBubbleSeen(broken, key), true, "shown once: not again on this page load");
  resetHelpBubbleMemory();
  assert.equal(readHelpBubbleSeen(null, key), false);
  markHelpBubbleSeen(null, key);
  assert.equal(readHelpBubbleSeen(null, key), true);
  resetHelpBubbleMemory();
});

test("initials: up to two, upper-case", () => {
  assert.equal(helpBubbleInitials("Alba Rivas"), "AR");
  assert.equal(helpBubbleInitials("alba"), "A");
  assert.equal(helpBubbleInitials("  "), "");
  assert.equal(helpBubbleInitials("Ángela María Ruiz"), "ÁR");
});

// ── Behaviour ────────────────────────────────────────────────────────────────

function rect(el: Element, r: { left: number; top: number; width: number; height: number }) {
  (el as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top }) as DOMRect;
}

/** Put a chat button on the page the way the dock, idle bar or floating button do. */
function addChatButton(kind: "dock" | "dock-empty" | "bar" | "fab") {
  const wrap = doc.createElement("div");
  if (kind === "dock" || kind === "dock-empty") {
    wrap.className = "cb-dock";
    wrap.setAttribute("data-show", "true");
    wrap.innerHTML = '<button class="cb-dock-ask"></button>';
    rect(wrap.querySelector(".cb-dock-ask")!, { left: 20, top: 700, width: 46, height: 46 });
  } else if (kind === "bar") {
    wrap.className = "cb-bar";
    wrap.setAttribute("data-show", "true");
    wrap.innerHTML = '<button class="cb-bar-chat"></button>';
    rect(wrap.querySelector(".cb-bar-chat")!, { left: 16, top: 720, width: 44, height: 44 });
  } else {
    wrap.innerHTML = "<button data-guest-chat-fab></button>";
    rect(wrap.querySelector("button")!, { left: 320, top: 740, width: 54, height: 54 });
  }
  doc.body.appendChild(wrap);
  return wrap;
}

function clearPage() {
  doc.body.innerHTML = "";
  dom.window.sessionStorage.clear();
  resetHelpBubbleMemory();
  Object.defineProperty(dom.window, "scrollY", { value: 0, configurable: true });
  Object.defineProperty(dom.window, "innerHeight", { value: 800, configurable: true });
  Object.defineProperty(dom.window, "innerWidth", { value: 390, configurable: true });
}

function setScroll(y: number) {
  Object.defineProperty(dom.window, "scrollY", { value: y, configurable: true });
  act(() => void dom.window.dispatchEvent(new dom.window.Event("scroll")));
}

function mount(props: Partial<React.ComponentProps<typeof ChatHelpBubble>> = {}, opened = { n: 0 }) {
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  const root = createRoot(host);
  const el = (p: Partial<React.ComponentProps<typeof ChatHelpBubble>>) => (
    <ChatHelpBubble
      profileCode="TAL-1"
      name="Alba"
      photoUrl="https://example.test/alba.jpg"
      t={es}
      chatOpen={false}
      onOpenChat={() => void opened.n++}
      {...p}
    />
  );
  act(() => root.render(el(props)));
  return { host, opened, rerender: (p: Partial<React.ComponentProps<typeof ChatHelpBubble>>) => act(() => root.render(el(p))), unmount: () => act(() => root.unmount()) };
}

const bubbleOf = (host: Element) => host.querySelector<HTMLElement>("[data-help-bubble]");

test("it appears above the dock's chat icon after 520px, left aligned, with a selection or without", () => {
  for (const kind of ["dock", "dock-empty"] as const) {
    clearPage();
    addChatButton(kind);
    const m = mount();
    setScroll(400);
    assert.equal(bubbleOf(m.host), null, "not before 520px");
    setScroll(600);
    const b = bubbleOf(m.host)!;
    assert.ok(b, `shows with the ${kind} up`);
    assert.equal(b.getAttribute("data-side"), "left");
    assert.equal(b.style.left, "20px", "aligned to the chat icon's left edge");
    assert.equal(b.style.bottom, "112px", "12px above the icon (800 - 700 + 12)");
    m.unmount();
  }
});

test("it also works with the idle bar's chat button and the floating button", () => {
  clearPage();
  addChatButton("bar");
  const a = mount();
  setScroll(700);
  assert.equal(bubbleOf(a.host)!.getAttribute("data-side"), "left");
  a.unmount();

  clearPage();
  addChatButton("fab");
  const b = mount();
  setScroll(700);
  const el = bubbleOf(b.host)!;
  assert.equal(el.getAttribute("data-side"), "right", "the floating button sits at the right edge");
  assert.equal(el.style.right, "16px");
  b.unmount();
  clearPage();
});

test("with no chat button on screen it does not show, and does not use up the visit", () => {
  clearPage();
  const m = mount();
  setScroll(900);
  assert.equal(bubbleOf(m.host), null);
  assert.equal(dom.window.sessionStorage.getItem(helpBubbleSessionKey("TAL-1")), null);
  addChatButton("dock");
  setScroll(950);
  assert.ok(bubbleOf(m.host), "shows once a chat button exists");
  m.unmount();
});

test("tapping the bubble opens the chat and it never returns; the x closes only the bubble and it never returns", () => {
  clearPage();
  addChatButton("dock");
  const a = mount();
  setScroll(700);
  act(() => bubbleOf(a.host)!.querySelector<HTMLButtonElement>(".tl-hello-b")!.click());
  assert.equal(a.opened.n, 1, "tap opens the chat");
  assert.equal(bubbleOf(a.host), null);
  setScroll(1500);
  assert.equal(bubbleOf(a.host), null, "never returns");
  a.unmount();
  const a2 = mount();
  setScroll(2000);
  assert.equal(bubbleOf(a2.host), null, "not on a remount in this visit");
  a2.unmount();

  clearPage();
  addChatButton("dock");
  const b = mount();
  setScroll(700);
  act(() => bubbleOf(b.host)!.querySelector<HTMLButtonElement>(".tl-hello-x")!.click());
  assert.equal(b.opened.n, 0, "x does not open the chat");
  assert.equal(bubbleOf(b.host), null);
  setScroll(1500);
  assert.equal(bubbleOf(b.host), null, "never returns this visit");
  b.unmount();
});

test("it hides itself after 9 seconds", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    clearPage();
    addChatButton("dock");
    const m = mount();
    setScroll(700);
    assert.ok(bubbleOf(m.host));
    act(() => mock.timers.tick(HELP_BUBBLE_VISIBLE_MS - 1));
    assert.ok(bubbleOf(m.host), "still there just before 9s");
    act(() => mock.timers.tick(2));
    assert.equal(bubbleOf(m.host), null);
    m.unmount();
  } finally {
    mock.timers.reset();
  }
});

test("it never shows, and hides at once, while the chat or a sheet is open", () => {
  clearPage();
  addChatButton("dock");
  const a = mount({ chatOpen: true });
  setScroll(900);
  assert.equal(bubbleOf(a.host), null, "chat open");
  assert.equal(dom.window.sessionStorage.getItem(helpBubbleSessionKey("TAL-1")), null, "a blocked bubble keeps the visit");
  a.unmount();

  clearPage();
  addChatButton("dock");
  const b = mount();
  setScroll(900);
  assert.ok(bubbleOf(b.host));
  act(() => void dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:maison-sheet", { detail: { open: true } })));
  assert.equal(bubbleOf(b.host), null, "the booking sheet opened");
  b.unmount();

  clearPage();
  addChatButton("dock");
  const c = mount();
  act(() => void dom.window.dispatchEvent(new dom.window.CustomEvent("tulala:maison-sheet", { detail: { open: true } })));
  setScroll(900);
  assert.equal(bubbleOf(c.host), null, "never starts under an open sheet");
  c.unmount();
});

test("it hides when the chat button goes away", () => {
  clearPage();
  const dock = addChatButton("dock");
  const m = mount();
  setScroll(700);
  assert.ok(bubbleOf(m.host));
  dock.remove();
  setScroll(720);
  assert.equal(bubbleOf(m.host), null);
  m.unmount();
});

test("anchor order: dock icon, then idle bar, then the floating button", () => {
  clearPage();
  addChatButton("fab");
  assert.equal(findHelpBubbleAnchor(doc)!.side, "right");
  addChatButton("bar");
  assert.ok(findHelpBubbleAnchor(doc)!.el.classList.contains("cb-bar-chat"));
  addChatButton("dock");
  assert.ok(findHelpBubbleAnchor(doc)!.el.classList.contains("cb-dock-ask"));
  clearPage();
});

// ── Content and accessibility ────────────────────────────────────────────────

test("photo with a 9px online dot; without a photo or with a broken one, initials in a tinted circle", () => {
  clearPage();
  addChatButton("dock");
  const a = mount();
  setScroll(700);
  const el = bubbleOf(a.host)!;
  assert.equal(el.querySelector("img")!.getAttribute("src"), "https://example.test/alba.jpg");
  assert.ok(el.querySelector(".tl-hello-av i"), "online dot");
  assert.equal(el.querySelector("[data-help-initials]"), null);
  // A broken image falls back to initials, never a broken icon.
  act(() => void el.querySelector("img")!.dispatchEvent(new dom.window.Event("error")));
  assert.equal(el.querySelector("img"), null);
  assert.equal(el.querySelector("[data-help-initials]")!.textContent, "A");
  a.unmount();

  clearPage();
  addChatButton("dock");
  const b = mount({ photoUrl: null, name: "Alba Rivas" });
  setScroll(700);
  assert.equal(bubbleOf(b.host)!.querySelector("[data-help-initials]")!.textContent, "AR");
  assert.equal(bubbleOf(b.host)!.querySelector("img"), null);
  b.unmount();
});

test("text uses the site locale, and the controls are labelled buttons inside role=status", () => {
  clearPage();
  addChatButton("dock");
  const a = mount({ t: es });
  setScroll(700);
  let el = bubbleOf(a.host)!;
  assert.equal(el.getAttribute("role"), "status");
  assert.match(el.textContent ?? "", /Alba.*¿Te ayudo a elegir\?/);
  const open = el.querySelector<HTMLButtonElement>(".tl-hello-b")!;
  assert.equal(open.tagName, "BUTTON");
  assert.equal(open.getAttribute("aria-label"), "Abrir chat con Alba");
  assert.equal(el.querySelector(".tl-hello-x")!.getAttribute("aria-label"), "Cerrar");
  a.unmount();

  clearPage();
  addChatButton("dock");
  const b = mount({ t: en });
  setScroll(700);
  el = bubbleOf(b.host)!;
  assert.match(el.textContent ?? "", /Can I help you choose\?/);
  assert.equal(el.querySelector(".tl-hello-b")!.getAttribute("aria-label"), "Open chat with Alba");
  b.unmount();
});

test("look: tokens only, 99/99/99/10 radius, 44px targets, entrance .45s, reduced motion off", () => {
  const css = HELP_BUBBLE_CSS;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /rgba?\(/);
  assert.match(css, /border-radius:99px 99px 99px 10px;padding:7px 14px 7px 7px/);
  assert.match(css, /box-shadow:0 16px 36px -16px color-mix\(in srgb,var\(--token-color-ink/);
  assert.match(css, /white-space:nowrap/);
  assert.match(css, /\.tl-hello-b b\{[^}]*font-style:italic[^}]*font-size:11\.5px[^}]*var\(--token-color-accent-text/);
  assert.match(css, /\.tl-hello-av i\{[^}]*width:9px;height:9px[^}]*var\(--token-color-success[^}]*0 0 0 2px var\(--token-color-surface-raised/);
  assert.match(css, /\.tl-hello-x\{[^}]*top:-8px;right:-8px;width:22px;height:22px[^}]*background:var\(--token-color-ink/);
  assert.match(css, /\.tl-hello-b\{[^}]*min-height:44px/);
  assert.match(css, /\.tl-hello-x::before\{[^}]*inset:-11px/, "x has a 44px effective target");
  assert.match(css, /animation:tl-hello-in \.45s cubic-bezier\(\.2,1\.3,\.3,1\)/);
  assert.match(css, /from\{opacity:0;transform:translateY\(10px\) scale\(\.9\)\}/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.tl-hello\{animation:none\}/);
});
