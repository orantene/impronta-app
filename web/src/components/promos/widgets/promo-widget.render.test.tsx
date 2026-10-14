/**
 * Promo widget island (TUL-1051 part B), rendered in jsdom: the gates (audience,
 * page, dismiss), reveal + analytics, the pop-up trigger and frequency cap, and
 * how "Book" hands over a link offer vs a code offer.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/menu" });
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
g.HTMLElement = dom.window.HTMLElement;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals before react-dom */
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { WidgetView } from "@/lib/promos/widgets/types";

import { PromoWidgetIsland, type PromoWidgetIslandProps } from "./promo-widget";
/* eslint-enable import/first */

const VIEW: WidgetView = {
  id: "00000000-0000-4000-8000-0000000000a1", offer: "20% off", headline: "Get 20% off", body: "Launch week",
  code: null, unlock: "auto", endsAtMs: null, countdown: false, leftLabel: null,
};
const base: PromoWidgetIslandProps = {
  nodeId: "n1", variant: "banner", views: [VIEW], locale: "en", tone: "accent", ctaLabel: "", ctaHref: "#services",
  audience: "everyone", startsAt: "", endsAt: "", tz: "America/Mexico_City", pagesMode: "all", pages: "", signedIn: null,
  dismissible: true, popupStyle: "modal", delaySec: 0, scrollPct: 0, exitIntent: false, frequency: "session",
  position: "bottom_right", preview: false,
};

type Sent = { promoId: string; kind: string };
let sent: Sent[] = [];
g.fetch = async (_url: unknown, init?: { body?: string }) => {
  if (init?.body) sent.push(JSON.parse(init.body) as Sent);
  return { ok: true } as Response;
};

function reset(): void {
  sent = [];
  dom.window.sessionStorage.clear();
  dom.window.localStorage.clear();
  dom.window.document.body.innerHTML = "";
  dom.window.history.replaceState({}, "", "/menu");
}

async function mount(props: Partial<PromoWidgetIslandProps>, node?: ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node ?? <PromoWidgetIsland {...base} {...props} />);
  });
  return { host, root };
}
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const q = <T extends Element>(sel: string): T | null => dom.window.document.querySelector<T>(sel);

test("a banner shows after mount, counts one view per session, and dismiss sticks for the tab", async () => {
  reset();
  const { root } = await mount({});
  assert.match(dom.window.document.body.textContent ?? "", /Get 20% off/);
  assert.deepEqual(sent.filter((s) => s.kind === "view").length, 1);
  await act(async () => { q<HTMLButtonElement>('button[aria-label="Close"]')?.click(); });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/);
  assert.equal(dom.window.sessionStorage.getItem("tl_pw_dismiss:n1"), "1");
  await act(async () => root.unmount());
  // Same tab, new mount: stays dismissed, and the view is not counted twice.
  const again = await mount({});
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/);
  assert.equal(sent.filter((s) => s.kind === "view").length, 1);
  await act(async () => again.root.unmount());
});

test("gates: a returning-only widget hides on a first visit; the wrong page hides; the right page shows", async () => {
  reset();
  let m = await mount({ audience: "returning" });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/);
  assert.equal(sent.length, 0, "a hidden widget records no view");
  await act(async () => m.root.unmount());

  reset();
  m = await mount({ pagesMode: "only", pages: "/contact" });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/);
  await act(async () => m.root.unmount());

  reset();
  m = await mount({ pagesMode: "only", pages: "/menu\n/contact" });
  assert.match(dom.window.document.body.textContent ?? "", /Get 20% off/);
  await act(async () => m.root.unmount());

  reset();
  m = await mount({ endsAt: "2020-01-01" });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/, "past the block's own schedule");
  await act(async () => m.root.unmount());
});

test("a promo that ended while the page was open disappears", async () => {
  reset();
  const m = await mount({ views: [{ ...VIEW, endsAtMs: Date.now() - 1000 }] });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /Get 20% off/);
  await act(async () => m.root.unmount());
});

test("reveal: the code stays hidden until tapped, then a reveal event is sent", async () => {
  reset();
  const m = await mount({ variant: "reveal", views: [{ ...VIEW, unlock: "code", code: "LUZ10" }] });
  assert.doesNotMatch(dom.window.document.body.textContent ?? "", /LUZ10/);
  await act(async () => { q<HTMLButtonElement>("[data-pw-reveal]")?.click(); });
  assert.equal(q("[data-pw-code]")?.textContent, "LUZ10");
  assert.deepEqual(sent.filter((s) => s.kind === "reveal").map((s) => s.promoId), [VIEW.id]);
  await act(async () => m.root.unmount());
});

test("reveal on an auto promo has no code to show and says it applies on its own", async () => {
  reset();
  const m = await mount({ variant: "reveal" });
  assert.equal(q("[data-pw-code]"), null);
  assert.match(dom.window.document.body.textContent ?? "", /Applies on its own/);
  await act(async () => m.root.unmount());
});

test("book: a code offer copies the code and says where to paste it, without a cookie call", async () => {
  reset();
  const written: string[] = [];
  Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
  const m = await mount({ variant: "book", views: [{ ...VIEW, unlock: "code", code: "LUZ10" }] });
  await act(async () => { q<HTMLAnchorElement>("[data-pw-book]")?.click(); });
  assert.deepEqual(written, ["LUZ10"]);
  assert.match(q("[data-pw-note]")?.textContent ?? "", /LUZ10 copied/);
  assert.equal(sent.some((s) => s.kind === "link_open"), false);
  await act(async () => m.root.unmount());
});

test("book: a link offer is pinned with link_open before the visitor goes to the menu", async () => {
  reset();
  const m = await mount({ variant: "book", views: [{ ...VIEW, unlock: "link" }] });
  await act(async () => { q<HTMLAnchorElement>("[data-pw-book]")?.click(); });
  await wait(20);
  assert.deepEqual(sent.filter((s) => s.kind === "link_open").map((s) => s.promoId), [VIEW.id]);
  assert.equal(dom.window.location.hash, "#services");
  await act(async () => m.root.unmount());
});

test("pop-up: opens on its trigger, the cap stops a second open, Escape closes it", async () => {
  reset();
  let m = await mount({ variant: "popup", delaySec: 0 });
  await wait(30);
  assert.ok(q('[role="dialog"]'), "the dialog opened");
  assert.equal(sent.filter((s) => s.kind === "view").length, 1, "the view counts when it opens");
  await act(async () => { dom.window.document.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })); });
  assert.equal(q('[role="dialog"]'), null);
  await act(async () => m.root.unmount());

  // Same tab, "once per visit": a second mount does not reopen it.
  m = await mount({ variant: "popup", delaySec: 0 });
  await wait(30);
  assert.equal(q('[role="dialog"]'), null);
  await act(async () => m.root.unmount());
});

test("pop-up: 'every visit' opens again", async () => {
  reset();
  for (let i = 0; i < 2; i += 1) {
    const m = await mount({ variant: "popup", delaySec: 0, frequency: "always" });
    await wait(30);
    assert.ok(q('[role="dialog"]'), `open #${i + 1}`);
    await act(async () => m.root.unmount());
  }
});

test("blocked storage never breaks the widget", async () => {
  reset();
  const origLocal = Object.getOwnPropertyDescriptor(dom.window, "localStorage");
  const origSession = Object.getOwnPropertyDescriptor(dom.window, "sessionStorage");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  Object.defineProperty(dom.window, "localStorage", { value: blocked, configurable: true });
  Object.defineProperty(dom.window, "sessionStorage", { value: blocked, configurable: true });
  try {
    const m = await mount({});
    assert.match(dom.window.document.body.textContent ?? "", /Get 20% off/);
    await act(async () => m.root.unmount());
  } finally {
    if (origLocal) Object.defineProperty(dom.window, "localStorage", origLocal);
    if (origSession) Object.defineProperty(dom.window, "sessionStorage", origSession);
  }
});

test("sticky floats outside the page tree and carries the theme tokens with it", async () => {
  reset();
  // jsdom does not inherit custom properties, so stand in for the browser's computed style.
  g.getComputedStyle = () => ({ getPropertyValue: (n: string) => (n === "--token-color-accent" ? "rgb(1, 2, 3)" : "") });
  const host = dom.window.document.createElement("section");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<PromoWidgetIsland {...base} variant="sticky" />); });
  const fixed = q('[data-promo-widget-fixed="sticky"]');
  assert.ok(fixed, "sticky rendered");
  assert.equal(host.contains(fixed), false, "portalled to body so no transformed ancestor can pin it");
  const carrier = fixed?.closest<HTMLElement>(".pw");
  assert.equal(carrier?.style.getPropertyValue("--token-color-accent"), "rgb(1, 2, 3)", "the site token travels with it");
  await act(async () => root.unmount());
  delete g.getComputedStyle;
});

test("preview draws every look in place with no gates and no analytics", async () => {
  reset();
  for (const variant of ["banner", "cards", "reveal", "countdown", "popup", "sticky", "book"] as const) {
    const m = await mount({ variant, preview: true, audience: "returning", pagesMode: "only", pages: "/nowhere" });
    assert.match(dom.window.document.body.textContent ?? "", variant === "book" ? /Book with this offer/ : /20% off/, variant);
    await act(async () => m.root.unmount());
  }
  assert.equal(sent.length, 0);
});
