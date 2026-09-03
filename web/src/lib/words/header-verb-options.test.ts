import test from "node:test";
import assert from "node:assert/strict";

import { HEADER_VERBS } from "./presets";
import {
  headerVerbHref,
  headerVerbPickerModel,
  verbNeedsCustomHref,
} from "./header-verb-options";

/**
 * The promise this module makes: **no verb can produce a live button pointing
 * at a route that does not exist.** Everything below is that claim, taken
 * apart.
 */

const RESOLVES_EVERYWHERE = new Set(["/book", "?inquiry=open"]);

test("every non-custom verb sends the visitor somewhere that resolves", () => {
  // The whole point of F1e. `/book` is allow-listed for every workspace type;
  // `?inquiry=open` is path-relative and needs no route and no seeded page.
  // Nothing else universally resolves on a tenant host, so nothing else is
  // offered.
  for (const verb of HEADER_VERBS) {
    if (verb === "custom") continue;
    const href = headerVerbHref(verb);
    assert.ok(href, `${verb} produced no destination`);
    assert.ok(
      RESOLVES_EVERYWHERE.has(href),
      `${verb} points at ${href}, which does not resolve on every workspace type`,
    );
  }
});

test("order and tickets go to the chat, because those routes do not exist yet", () => {
  // Deliberate and honest: a button that opens a conversation about ordering is
  // true; a button to /menu is a 404. When Menu and Events ship public routes
  // this changes in ONE place.
  assert.equal(headerVerbHref("order"), "?inquiry=open");
  assert.equal(headerVerbHref("tickets"), "?inquiry=open");
});

test("custom is the only verb that needs an address", () => {
  assert.equal(verbNeedsCustomHref("custom"), true);
  for (const verb of HEADER_VERBS) {
    if (verb === "custom") continue;
    assert.equal(verbNeedsCustomHref(verb), false, verb);
  }
});

test("custom with no usable address yields NO button, not a button to nowhere", () => {
  // There must be no path through this that produces a live control pointing
  // at nothing. Null is the caller's instruction to render no button.
  for (const bad of [undefined, null, "", "   ", "\t\n"]) {
    assert.equal(headerVerbHref("custom", bad), null, JSON.stringify(bad));
  }
  assert.equal(headerVerbHref("custom", "  https://example.com/menu "), "https://example.com/menu");
});

test("a fixed verb ignores a stray custom href", () => {
  // Switching from custom to a verb must not leave the old address in play.
  assert.equal(headerVerbHref("book", "https://leftover.example"), "/book");
  assert.equal(headerVerbHref("ask", "/contact"), "?inquiry=open");
});

// ─── The <select> invariant, same as the preset picker ───────────────────

test("the selected value is ALWAYS present in the options", () => {
  for (const raw of [...HEADER_VERBS, null, undefined, "", "  ", "nonsense", 7, {}, [], true]) {
    for (const locale of ["en", "es"] as const) {
      const { options, selected } = headerVerbPickerModel(raw, locale);
      assert.ok(
        options.some((o) => o.value === selected),
        `${JSON.stringify(raw)} (${locale}) selected "${selected}" with no matching option`,
      );
    }
  }
});

test("an unreadable stored verb becomes Ask, not the first option", () => {
  // The safe default: the chat always works. A workspace whose verb we cannot
  // read must not silently become "Reserve" and point at a booking page it does
  // not run — and "reserve" IS the first option, so a naive fallback would.
  const { options, selected } = headerVerbPickerModel("retired_verb", "en");
  assert.equal(selected, "ask");
  assert.notEqual(options[0]?.value, "ask", "ask is not first, so a first-option fallback would differ");
});

test("case and whitespace in the column still select the right verb", () => {
  assert.equal(headerVerbPickerModel("  Reserve ", "en").selected, "reserve");
  assert.equal(headerVerbPickerModel("TICKETS", "en").selected, "tickets");
});

test("every option has a non-blank label and hint, in both languages", () => {
  const offenders: string[] = [];
  for (const locale of ["en", "es"] as const) {
    for (const option of headerVerbPickerModel(null, locale).options) {
      if (!option.label.trim()) offenders.push(`${option.value}.label.${locale}`);
      if (!option.hint.trim()) offenders.push(`${option.value}.hint.${locale}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("es is Spanish, not English left in the es slot", () => {
  const en = headerVerbPickerModel(null, "en").options;
  const es = headerVerbPickerModel(null, "es").options;
  const same = en.filter((o, i) => o.label === es[i]?.label).map((o) => o.value);
  assert.deepEqual(same, [], "these labels are identical in both languages");
});

test("no em dashes in operator-facing copy", () => {
  for (const locale of ["en", "es"] as const) {
    for (const option of headerVerbPickerModel(null, locale).options) {
      assert.ok(!option.label.includes("—"), `${option.value}.label.${locale}`);
      assert.ok(!option.hint.includes("—"), `${option.value}.hint.${locale}`);
    }
  }
});

test("the hint tells the operator what the button will actually do", () => {
  // A picker that says "Order" without saying it opens the chat would be a
  // surprise at the moment a customer clicks, not at the moment it is chosen.
  const { options } = headerVerbPickerModel(null, "en");
  const order = options.find((o) => o.value === "order");
  assert.ok(order?.hint.toLowerCase().includes("chat"), order?.hint);
  const book = options.find((o) => o.value === "book");
  assert.ok(book?.hint.toLowerCase().includes("booking"), book?.hint);
});
