/**
 * TUL-548 GRK-042: a quote / request service opens the chat on Continuar, so the dock must not
 * promise "Ver horarios" / "See times" (Gridline CSS label) or a bare "Continuar" for it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { UTILITY_BOOKING_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-utility-booking";

import { SelectionDock } from "./SelectionDock";

const base = {
  items: [{ id: "o1", title: "Cotizar", imageUrl: null, bits: null, totalCents: 0, priceLabel: null }],
  show: true,
  formatPrice: (c: number) => `$${c / 100}`,
  onRemoveFront: () => {},
  onAsk: () => {},
  onContinue: () => {},
  toast: null,
  onUndo: () => {},
};
const html = (locale: string, askOnly?: boolean) =>
  renderToStaticMarkup(<SelectionDock {...base} locale={locale} {...(askOnly ? { askOnly } : {})} />);

test("ask-only dock names the chat action (ES + EN) and marks the button", () => {
  assert.match(html("es", true), /data-ask-only="true"[^>]*>Pedir cotización/);
  assert.match(html("en", true), /data-ask-only="true"[^>]*>Ask for a quote/);
});

test("bookable dock markup is unchanged", () => {
  assert.ok(!html("es").includes("data-ask-only"));
  assert.ok(html("es").includes("Continuar"));
});

test("Gridline See times / Ver horarios label never applies to an ask-only dock", () => {
  for (const label of ["See times", "Ver horarios"]) {
    const rule = UTILITY_BOOKING_CSS.split("\n").find((r) => r.includes(`content:"${label}"`))!;
    assert.ok(rule.includes(":not([data-ask-only])"), label);
  }
});
