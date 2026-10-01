/**
 * Slice 2.6 dock: the chat button wears her photo with an online dot and an
 * unread dot (DK-1), and the toast has the mockup's kinds, timings and look
 * (TO-1). Rendered in jsdom; the CSS is asserted from source.
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
g.IS_REACT_ACT_ENVIRONMENT = true;

/* eslint-disable import/first -- jsdom globals must exist before react-dom loads */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SelectionDock } from "./SelectionDock";
import { setChatPresence } from "./chat-presence-store";
import {
  dockToastHasUndo,
  dockToastMs,
  dockToastText,
  selectionDockCopy,
  type DockToast,
} from "./selection-dock-state";
import { useDockToast } from "./use-dock-toast";
/* eslint-enable import/first */

const here = dirname(fileURLToPath(import.meta.url));
const ITEM: { id: string; title: string; imageUrl: string | null; bits: string | null; totalCents: number; priceLabel: string | null } = { id: "o1", title: "Gel pedicure", imageUrl: null, bits: null, totalCents: 30000, priceLabel: null };

function mountDock(toast: DockToast | null = null, item: typeof ITEM = ITEM) {
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SelectionDock
        items={[item]}
        show
        locale="es"
        formatPrice={(c) => `$${c / 100}`}
        onRemoveFront={() => undefined}
        onAsk={() => undefined}
        onContinue={() => undefined}
        toast={toast}
        onUndo={() => undefined}
      />,
    ),
  );
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

// ── DK-1 ─────────────────────────────────────────────────────────────────────

test("dock: the chat button is always the speech-bubble icon, never the talent photo", () => {
  for (const presence of [null, { photoUrl: "https://example.test/alba.jpg", name: "Alba", unread: false }]) {
    setChatPresence(presence);
    const { host, unmount } = mountDock();
    const ask = host.querySelector(".cb-dock-ask")!;
    assert.ok(ask.querySelector("svg"), "chat icon");
    assert.equal(ask.querySelector("img"), null, "no photo on the chat button");
    assert.equal(host.querySelector("[data-dock-avatar]"), null);
    unmount();
  }
  setChatPresence(null);
});

test("dock: online and unread are small dots on the icon, only while the chat is live", () => {
  setChatPresence(null);
  const off = mountDock();
  assert.equal(off.host.querySelector(".cb-dock-ask .cb-dock-dot"), null, "no live chat, no online dot");
  off.unmount();
  setChatPresence({ photoUrl: "https://example.test/alba.jpg", name: "Alba", unread: false });
  const on = mountDock();
  assert.ok(on.host.querySelector(".cb-dock-ask .cb-dock-dot"), "online dot");
  assert.equal(on.host.querySelector("[data-dock-unread]"), null);
  act(() => setChatPresence({ photoUrl: null, name: "Alba", unread: true }));
  assert.ok(on.host.querySelector(".cb-dock-ask [data-dock-unread]"), "unread dot follows the chat");
  on.unmount();
  setChatPresence(null);
});

test("dock: chat button first, then the service thumbnail, title, price and Continuar", () => {
  const withPhoto = mountDock(null, { ...ITEM, imageUrl: "https://example.test/lift.jpg" });
  const kids = [...withPhoto.host.querySelector(".cb-dock")!.children].map((c) => c.className.split(" ")[0]);
  assert.deepEqual(kids.slice(0, 4), ["cb-dock-ask", "cb-dock-stack", "cb-dock-info", "cb-dock-go"]);
  const thumb = withPhoto.host.querySelector<HTMLImageElement>(".cb-dock-stack img.cb-dock-th")!;
  assert.equal(thumb.getAttribute("src"), "https://example.test/lift.jpg", "the service photo, not hers");
  assert.equal(withPhoto.host.querySelector(".cb-dock-stack")!.getAttribute("data-dock-thumb"), "photo");
  assert.match(withPhoto.host.querySelector(".cb-dock-info")!.textContent ?? "", /Gel pedicure/);
  withPhoto.unmount();
  // No photo: a rounded icon tile stands in, never the talent photo.
  setChatPresence({ photoUrl: "https://example.test/alba.jpg", name: "Alba", unread: false });
  const noPhoto = mountDock();
  const stack = noPhoto.host.querySelector(".cb-dock-stack")!;
  assert.equal(stack.getAttribute("data-dock-thumb"), "icon");
  assert.ok(stack.querySelector(".cb-dock-th-icon svg"));
  assert.equal(noPhoto.host.querySelector('img[src="https://example.test/alba.jpg"]'), null);
  assert.ok(stack.querySelector(".cb-dock-x"), "remove stays reachable");
  noPhoto.unmount();
  setChatPresence(null);
});

test("DK-1 the launcher publishes presence only while it is mounted", () => {
  const launcher = readFileSync(join(here, "../../app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx"), "utf8");
  assert.match(launcher, /setChatPresence\(\{ photoUrl: presencePhoto, name: talentFirst, unread: unseenAgencyReply, open \}\)/);
  assert.match(launcher, /return \(\) => setChatPresence\(null\)/);
});

// ── TO-1 ─────────────────────────────────────────────────────────────────────

test("TO-1 the toast kinds read as the mockup does, in Spanish and English", () => {
  const es = selectionDockCopy("es");
  const en = selectionDockCopy("en");
  assert.equal(dockToastText(es, { kind: "added", name: "Gel" }), "Gel en tu cita");
  assert.equal(dockToastText(es, { kind: "removed", name: "Gel" }), "Quitaste Gel");
  assert.equal(dockToastText(en, { kind: "added", name: "Gel" }), "Gel in your booking");
  assert.equal(dockToastText(en, { kind: "switched", name: "Gel" }), "Switched to Gel");
  for (const c of [es, en]) for (const k of ["added", "removed", "switched"] as const) assert.doesNotMatch(dockToastText(c, { kind: k, name: "x" }), /—|–/);
});

test("TO-1 a plain confirmation lasts 2.6s; a toast with Undo lasts 5s", () => {
  assert.equal(dockToastMs("added"), 2600);
  assert.equal(dockToastMs("removed"), 5000);
  assert.equal(dockToastMs("switched"), 5000);
  assert.equal(dockToastHasUndo("added"), false);
  assert.equal(dockToastHasUndo("removed"), true);
});

test("TO-1 only Undo toasts carry the Deshacer button", () => {
  const added = mountDock({ kind: "added", name: "Gel pedicure" });
  const toast = added.host.querySelector<HTMLElement>(".cb-dock-toast")!;
  assert.equal(toast.getAttribute("data-show"), "true");
  assert.equal(toast.getAttribute("data-kind"), "added");
  assert.match(toast.textContent ?? "", /Gel pedicure en tu cita/);
  assert.equal(toast.querySelector("button"), null, "a confirmation has nothing to undo");
  added.unmount();
  const removed = mountDock({ kind: "removed", name: "Gel pedicure" });
  assert.match(removed.host.querySelector(".cb-dock-toast")!.textContent ?? "", /Quitaste Gel pedicure.*Deshacer/);
  removed.unmount();
});

test("TO-1 the toast hook hides a confirmation after 2.6s and an Undo toast after 5s", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let api!: ReturnType<typeof useDockToast>;
    const Probe = () => {
      api = useDockToast();
      return null;
    };
    const host = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    act(() => api.showToast({ kind: "added", name: "Gel" }));
    assert.equal(api.toast?.kind, "added");
    act(() => mock.timers.tick(2599));
    assert.ok(api.toast, "still up just before 2.6s");
    act(() => mock.timers.tick(2));
    assert.equal(api.toast, null);
    act(() => api.showToast({ kind: "removed", name: "Gel" }));
    act(() => mock.timers.tick(4999));
    assert.ok(api.toast, "an Undo toast stays to 5s");
    act(() => mock.timers.tick(2));
    assert.equal(api.toast, null);
    act(() => root.unmount());
    host.remove();
  } finally {
    mock.timers.reset();
  }
});

test("TO-1 look and motion: Maison dark pill radius 14, 84px, rises in .2s; every dock animation honours reduced motion; no hex", () => {
  const dts = readFileSync(join(here, "../../lib/talent-site/theme-catalog/collection/design-type-system.ts"), "utf8");
  assert.match(dts, /\.cb-dock-toast\{border-radius:14px;padding:10px 12px 10px 14px;bottom:calc\(84px/);
  assert.match(dts, /\.cb-dock-toast\{bottom:96px\}/);
  assert.match(dts, /transition:opacity \.2s ease,transform \.2s ease/);
  const css = readFileSync(join(here, "catalog-booking-styles.ts"), "utf8");
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.cb-dock,\.cb-dock \*,\.cb-dock-toast,\.cb-dock-go::after\{transition:none!important;animation:none!important\}\}/);
  const dockCss = css.slice(css.indexOf("/* AUD-044"));
  assert.doesNotMatch(dockCss, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(dockCss, /cb-dock-avatar/);
  assert.match(dockCss, /\.cb-dock-th-icon\{/);
  assert.match(dockCss, /\.cb-dock-unread\{/);
});

// ── CH-3 from the dock: a picked service, sheet never opened ─────────────────

test("CH-3 a service picked in the dock (sheet never opened) is offered back, and resume continues like Continuar", async () => {
  const { peekBookingResume, clearBookingResume, requestBookingResume, setBookingResume } = await import("./booking-resume-store");
  const { useDockBookingResume } = await import("./use-dock-booking-resume");
  clearBookingResume();
  let continued = 0;
  const Probe = ({ item }: { item: { title: string; totalCents: number; priceLabel: string | null; currency: string } | null }) => {
    useDockBookingResume(item, () => void continued++);
    return null;
  };
  const host = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const item = { title: "Gel pedicure", totalCents: 0, priceLabel: "Desde $120", currency: "MXN" };
  act(() => root.render(<Probe item={item} />));
  const snap = peekBookingResume();
  assert.ok(snap, "the pick is published");
  assert.equal(snap.detail, null);
  assert.equal(snap.title, "Gel pedicure");
  assert.equal(snap.priceLabel, "Desde $120");
  assert.equal(snap.totalCents, null, "an inexact price shows the label, not $0");

  act(() => requestBookingResume());
  assert.equal(continued, 1, "the dock carries on exactly like Continuar");

  // A sheet stash is never overwritten by the dock.
  const sheetStash = { detail: {} as never, step: "who" as const, title: "From sheet", totalCents: 100, currency: "MXN" };
  act(() => setBookingResume(sheetStash));
  act(() => root.render(<Probe item={{ ...item, totalCents: 5 }} />));
  assert.equal(peekBookingResume()?.title, "From sheet");
  act(() => requestBookingResume());
  assert.equal(continued, 1, "the dock leaves a sheet resume to the sheet");

  // Removing the pick withdraws a dock-only offer.
  clearBookingResume();
  act(() => root.render(<Probe item={item} />));
  assert.ok(peekBookingResume());
  act(() => root.render(<Probe item={null} />));
  assert.equal(peekBookingResume(), null);
  act(() => root.unmount());
  host.remove();
});
