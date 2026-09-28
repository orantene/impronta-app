/**
 * AUD-044 — selection dock reducer, summary copy, and FAB/dock static contracts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EMPTY_DOCK,
  MULTI_SERVICE_ENABLED,
  dockPickSwitches,
  dockReducer,
  dockSummary,
  makeDockReducer,
  selectionDockCopy,
  type DockPick,
} from "./selection-dock-state";

const here = dirname(fileURLToPath(import.meta.url));
const pick = (id: string, totalCents = 30000, bits: string | null = null): DockPick => ({
  id,
  bits,
  totalCents,
  currency: "MXN",
});
const ids = (s: { picked: DockPick[] }) => s.picked.map((p) => p.id);
const fmt = (c: number) => `$${c / 100}`;
/** Dormant multi-service paths (combined-appointment program), tested directly. */
const multiReducer = makeDockReducer(true);

test("multi-service booking is OFF until the combined-appointment engine ships", () => {
  assert.equal(MULTI_SERVICE_ENABLED, false);
});

test("single-select: a second pick REPLACES the first and can be undone", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a", 30000, "x") });
  assert.equal(dockPickSwitches(s, "b"), true);
  assert.equal(dockPickSwitches(s, "a"), false);
  s = dockReducer(s, { type: "toggle", pick: pick("b") });
  assert.deepEqual(ids(s), ["b"]);
  assert.equal(s.lastRemoved?.pick.id, "a");
  assert.equal(s.lastRemoved?.replacedBy, "b");
  s = dockReducer(s, { type: "undo" });
  assert.deepEqual(ids(s), ["a"]);
  assert.equal(s.picked[0].bits, "x");
});

test("single-select: never holds two services (toggle or sheet upsert)", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = dockReducer(s, { type: "toggle", pick: pick("b") });
  s = dockReducer(s, { type: "toggle", pick: pick("c") });
  assert.deepEqual(ids(s), ["c"]);
  s = dockReducer(s, { type: "upsert", pick: pick("d") });
  assert.deepEqual(ids(s), ["d"]);
  // Re-tapping the selected row still deselects it.
  assert.deepEqual(ids(dockReducer(s, { type: "toggle", pick: pick("d") })), []);
});

test("toggle selects, a second toggle deselects", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  assert.deepEqual(ids(s), ["a"]);
  s = dockReducer(s, { type: "toggle", pick: pick("a") });
  assert.deepEqual(ids(s), []);
});

test("(dormant multi) multi-select keeps pick order; front is the first picked", () => {
  let s = multiReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = multiReducer(s, { type: "toggle", pick: pick("b") });
  assert.deepEqual(ids(s), ["a", "b"]);
});

test("upsert (sheet select) updates bits in place and never toggles off", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = dockReducer(s, { type: "upsert", pick: pick("a", 65000, "Largo #3") });
  assert.deepEqual(ids(s), ["a"]);
  assert.equal(s.picked[0].bits, "Largo #3");
  assert.equal(s.picked[0].totalCents, 65000);
});

test("(dormant multi) remove_front drops only the front item and remembers it", () => {
  let s = multiReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = multiReducer(s, { type: "toggle", pick: pick("b") });
  s = multiReducer(s, { type: "remove_front" });
  assert.deepEqual(ids(s), ["b"]);
  assert.equal(s.lastRemoved?.pick.id, "a");
});

test("remove on a single pick empties the dock", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = dockReducer(s, { type: "remove_front" });
  assert.deepEqual(ids(s), []);
  assert.equal(dockReducer(s, { type: "remove_front" }).picked.length, 0);
});

test("undo after ✕ restores the removed item", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a", 30000, "x") });
  s = dockReducer(s, { type: "remove_front" });
  s = dockReducer(s, { type: "undo" });
  assert.deepEqual(ids(s), ["a"]);
  assert.equal(s.picked[0].bits, "x");
  assert.equal(s.lastRemoved, null);
  // A second undo is a no-op.
  assert.deepEqual(ids(dockReducer(s, { type: "undo" })), ["a"]);
});

test("(dormant multi) undo restores the removed item to the front", () => {
  let s = multiReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a", 30000, "x") });
  s = multiReducer(s, { type: "toggle", pick: pick("b") });
  s = multiReducer(s, { type: "remove_front" });
  s = multiReducer(s, { type: "undo" });
  assert.deepEqual(ids(s), ["a", "b"]);
});

test("undo does not duplicate an item re-selected before Undo", () => {
  let s = dockReducer(EMPTY_DOCK, { type: "toggle", pick: pick("a") });
  s = dockReducer(s, { type: "remove_front" });
  s = { ...dockReducer(s, { type: "toggle", pick: pick("a") }), lastRemoved: s.lastRemoved };
  s = dockReducer(s, { type: "undo" });
  assert.deepEqual(ids(s), ["a"]);
});

test("summary: catalog priceLabel (#2388) replaces $0 for quote / from rows", () => {
  const quote = dockSummary([{ title: "Evento", bits: null, totalCents: 0, priceLabel: "A cotizar" }], "es", fmt);
  assert.equal(quote.line, "A cotizar");
  const from = dockSummary([{ title: "Soft Gel", bits: null, totalCents: 0, priceLabel: "Desde $650" }], "es", fmt);
  assert.equal(from.line, "Desde $650");
  const sheet = dockSummary([{ title: "Soft Gel", bits: "Largo #3", totalCents: 65000, priceLabel: null }], "es", fmt);
  assert.equal(sheet.line, "Largo #3 · $650");
});

test("summary: single = name + options · price; multi = N services + A + B · total", () => {
  const one = dockSummary([{ title: "Soft Gel", bits: "Largo #3", totalCents: 65000 }], "es", fmt);
  assert.deepEqual(one, { name: "Soft Gel", line: "Largo #3 · $650" });
  const bare = dockSummary([{ title: "Soft Gel", bits: null, totalCents: 65000 }], "es", fmt);
  assert.equal(bare.line, "$650");
  const two = [
    { title: "Soft Gel", bits: null, totalCents: 65000 },
    { title: "Gel en pies", bits: null, totalCents: 30000 },
  ];
  assert.deepEqual(dockSummary(two, "es-MX", fmt), {
    name: "2 servicios",
    line: "Soft Gel + Gel en pies · $950",
  });
  assert.equal(dockSummary(two, "en", fmt).name, "2 services");
});

test("dock copy is localized (ES tú) and has no em dashes", () => {
  const es = selectionDockCopy("es");
  const en = selectionDockCopy("en-US");
  assert.equal(es.removed("Soft Gel"), "Quitaste Soft Gel");
  assert.equal(es.switched("Rubber Gel"), "Cambiaste a Rubber Gel");
  assert.equal(en.switched("Rubber Gel"), "Switched to Rubber Gel");
  assert.equal(es.undo, "Deshacer");
  assert.equal(es.continueLabel, "Continuar");
  assert.equal(es.remove("Soft Gel"), "Quitar Soft Gel");
  assert.equal(en.removed("Soft Gel"), "Removed Soft Gel");
  assert.equal(en.undo, "Undo");
  assert.equal(en.continueLabel, "Continue");
  for (const c of [es, en]) {
    const strings = [c.region, c.ask, c.askMany, c.undo, c.continueLabel, c.services(2), c.removed("x"), c.switched("x")];
    for (const str of strings) assert.doesNotMatch(str, /—/);
  }
});

test("chat quick questions + FAB hover label exist in en/es with no em dashes", () => {
  const load = (loc: string) =>
    JSON.parse(readFileSync(join(here, "../../../messages", `${loc}.json`), "utf8")).public
      .guestChat as Record<string, string>;
  const es = load("es");
  const en = load("en");
  assert.equal(es.fabHoverLabel, "Escríbeme");
  assert.equal(en.fabHoverLabel, "Message me");
  assert.equal(es.askAboutEyebrow, "Pregunta sobre");
  assert.equal(en.askAboutEyebrow, "Asking about");
  assert.equal(es.askQuickWhen, "¿Tienes hueco esta semana?");
  assert.equal(es.askQuickDuration, "¿Cuánto dura?");
  assert.equal(es.askQuickChange, "¿Puedo cambiar el diseño?");
  for (const k of ["askQuickWhen", "askQuickDuration", "askQuickChange", "askQuickLabel"]) {
    assert.ok(en[k], `en ${k}`);
    assert.doesNotMatch(en[k] + es[k], /—/);
  }
});

test("FAB is icon-only: no always-visible label; hover label is width-0 until hover", () => {
  const src = readFileSync(
    join(here, "../../app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx"),
    "utf8",
  );
  // The old desktop pill rendered the lifecycle label as a visible span.
  assert.doesNotMatch(src, /<span>\{launcherLabel\}<\/span>/);
  assert.doesNotMatch(src, /collapsedByScroll/);
  assert.match(src, /className="tl-fab-lbl" aria-hidden/);
  assert.match(src, /\.tl-fab-lbl\{max-width:0;/);
  assert.match(src, /height:54px;min-width:54px/);
  assert.match(src, /@media \(hover:hover\) and \(pointer:fine\)\{\.tl-fab:hover/);
  assert.match(src, /animation:tl-fab-ring 2\.8s 1s 2 /);
  assert.match(src, /\.tl-fab\[data-gone="true"\]\{transform:translate\(-40px,-6px\) scale\(\.4\);opacity:0/);
  assert.match(src, /prefers-reduced-motion:reduce\)\{\.tl-fab/);
});

test("dock CSS: glass, spring, reduced motion, no hex literals", () => {
  const css = readFileSync(join(here, "catalog-booking-styles.ts"), "utf8");
  const dockCss = css.slice(css.indexOf("/* AUD-044"));
  assert.match(dockCss, /backdrop-filter:blur\(18px\) saturate\(1\.4\)/);
  assert.match(dockCss, /border-radius:22px/);
  assert.match(dockCss, /transition:transform \.55s var\(--cb-ease\)/);
  assert.match(dockCss, /--cb-ease:cubic-bezier\(\.2,\.9,\.25,1\.15\)/);
  assert.match(dockCss, /prefers-reduced-motion:reduce\)\{\.cb-dock/);
  assert.doesNotMatch(dockCss, /#[0-9a-fA-F]{3,8}\b/);
});

test("the old selection card copy is gone; the dock replaces it", () => {
  const src = readFileSync(
    join(here, "../../lib/site-admin/builder-node/services-catalog-filter.tsx"),
    "utf8",
  );
  assert.match(src, /<SelectionDock/);
  assert.doesNotMatch(src, /selectedTitle \?\?/);
  assert.match(src, /askAbout: dockItems\.map/);
  // Single-select switch is announced with Undo, never silent.
  assert.match(src, /showToast\(\{ kind: "switched", name: item\.title \}\)/);
});
