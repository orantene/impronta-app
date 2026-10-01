/**
 * Gridline G12: the dock follows the live status, the sheet gets step dots,
 * fills the phone screen and wears the wide type. All scoped to the utility
 * type system, so every other design renders byte-identical (HARD RULE: the
 * chat is the engine, this only themes).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { UTILITY_BOOKING_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-utility-booking";
import { TypeSystemStyle } from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";

import { CATALOG_BOOKING_CSS } from "./catalog-booking-styles";
import { SelectionDock } from "./SelectionDock";

const ITEM = { id: "o1", title: "Revision", imageUrl: null, bits: null, totalCents: 55000, priceLabel: null };
const base = {
  items: [ITEM],
  show: true,
  formatPrice: (c: number) => `$${c / 100}`,
  onRemoveFront: () => {},
  onAsk: () => {},
  onContinue: () => {},
  toast: null,
  onUndo: () => {},
};
const future = new Date(Date.now() + 3_600_000).toISOString();
const ON = { emergenciesToday: true, emergenciesUntil: future };
const OFF = { emergenciesToday: false, emergenciesUntil: null };
const html = (locale: string, liveStatus?: typeof ON | typeof OFF | null) =>
  renderToStaticMarkup(<SelectionDock {...base} locale={locale} {...(liveStatus === undefined ? {} : { liveStatus })} />);

test("existing designs: the base booking stylesheet is byte-pinned", () => {
  assert.equal(createHash("sha256").update(CATALOG_BOOKING_CSS).digest("hex"), "3d92c12303fd99e70ddcbacc6dd7dba08121d16b94e359c6bbb63cafb8a6ab54");
});

test("existing designs: dock markup is identical with no status, null or off", () => {
  const plain = html("es");
  assert.equal(html("es", null), plain);
  assert.equal(html("es", OFF), plain);
  assert.ok(!plain.includes("cb-dock-lbl"));
  assert.ok(plain.includes("Continuar"));
});

test("dock label swaps while emergencies are on (EN + ES), second label hidden by default", () => {
  assert.match(html("es", ON), /cb-dock-lbl-off">Continuar</);
  assert.match(html("es", ON), /cb-dock-lbl-on" data-dock-live="on" hidden="">Consultar</);
  assert.match(html("en", ON), /hidden="">Ask now</);
});

test("every utility booking rule is scoped to the utility type system", () => {
  for (const rule of UTILITY_BOOKING_CSS.split("\n")) {
    const inner = rule.startsWith("@media") ? rule.slice(rule.indexOf("{") + 1) : rule;
    assert.ok(inner.startsWith('[data-theme-canvas-root]:where([data-token-type-system="utility"'), rule.slice(0, 80));
  }
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(UTILITY_BOOKING_CSS), "no hex");
});

test("step dots: three, one per step, hidden on done; phone sheet fills the screen", () => {
  for (const step of ["choose", "when", "who"]) assert.ok(UTILITY_BOOKING_CSS.includes(`[data-catalog-continue="${step}"]`));
  assert.ok(UTILITY_BOOKING_CSS.includes(":not(:has([data-catalog-continue])) .jb-head::after{display:none}"));
  const dotsRule = UTILITY_BOOKING_CSS.split("\n").find((r) => r.includes(".jb-head::after{content"))!;
  assert.equal((dotsRule.match(/radial-gradient/g) ?? []).length, 3);
  assert.match(UTILITY_BOOKING_CSS, /max-width:719px\)\{[^\n]*\.jb-sheet\{max-width:none;width:100%;height:100%;max-height:none;border-radius:0\}/);
  assert.match(UTILITY_BOOKING_CSS, /\.jb-head h2\{font-family:var\(--site-heading-font/);
});

test("the booking CSS ships through the type-system sheet", () => {
  assert.ok(renderToStaticMarkup(<TypeSystemStyle />).includes('data-type-system-style="utility-booking"'));
});

test("Gridline off state reads See times / Ver horarios by CSS only; markup and ON label unchanged", () => {
  for (const [loc, label, region] of [["en", "See times", "Your selection"], ["es", "Ver horarios", "Tu selección"]] as const) {
    assert.ok(UTILITY_BOOKING_CSS.includes(`.cb-dock[aria-label="${region}"] .cb-dock-go:not(:has(.cb-dock-lbl-on))::before{content:"${label}"`));
    assert.ok(html(loc, OFF).includes(`aria-label="${region}"`), "selector key present in markup");
    assert.ok(html(loc, OFF).includes(loc === "es" ? "Continuar" : "Continue"), "markup text untouched");
  }
  assert.match(html("es", ON), /Consultar</);
  assert.match(html("en", ON), /Ask now</);
  assert.ok(!html("es", OFF).includes("Ver horarios") && !html("en", OFF).includes("See times"), "no markup change for other designs");
});
