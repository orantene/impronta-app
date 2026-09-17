/**
 * `?f_<field>=` on a page URL becomes the default value of that form field.
 *
 * A marketing CTA ("Book the posing course") lands on a form that already
 * names the product, so the inquiry reaches the inbox with the product in it.
 * These tests pin the contract: only `f_`-prefixed keys count, values are
 * capped, a select only accepts one of its own options, and a page with no
 * prefill renders byte-identical markup to before the option existed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { formPrefillFromSearchParams, formPrefillQuery } from "./form-prefill";
import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

test("only f_-prefixed keys become prefill values; empties and junk names drop", () => {
  const got = formPrefillFromSearchParams({
    f_service: "  Posing course ",
    f_message: ["first", "second"],
    "f_bad name": "x",
    f_: "x",
    f_empty: "   ",
    inquiry: "open",
  });
  assert.deepEqual(got, { service: "Posing course", message: "first" });
  assert.equal(formPrefillFromSearchParams({ inquiry: "open" }), null);
  assert.equal(formPrefillFromSearchParams(undefined), null);
});

test("values are capped so a hostile URL cannot inflate the page", () => {
  const got = formPrefillFromSearchParams({ f_message: "x".repeat(5000) });
  assert.equal(got?.message.length, 600);
});

test("formPrefillQuery round-trips through formPrefillFromSearchParams", () => {
  const qs = formPrefillQuery({ service: "Modelo por un día", message: "Hola" });
  const parsed = Object.fromEntries(new URLSearchParams(qs));
  assert.deepEqual(formPrefillFromSearchParams(parsed), {
    service: "Modelo por un día",
    message: "Hola",
  });
});

const form = {
  id: "f1",
  kind: "form",
  props: {
    action: "internal",
    method: "post",
    fields: [
      { id: "a", name: "name", type: "text", label: "Name" },
      { id: "b", name: "service", type: "select", label: "Service", options: ["A", "B"] },
      { id: "c", name: "message", type: "textarea", label: "Message" },
      { id: "d", name: "submit", type: "submit", label: "Send" },
    ],
  },
} as unknown as BuilderNode;

test("form node renders prefill as default values; unknown select values are ignored", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes([form], {
      formPrefill: { name: "Ana", service: "B", message: "Hi" },
    }),
  );
  assert.match(html, /name="name"[^>]*value="Ana"/);
  assert.match(html, /<option[^>]*value="B"[^>]*selected|<option[^>]*selected[^>]*value="B"/);
  assert.match(html, /<textarea[^>]*name="message"[^>]*>Hi<\/textarea>/);

  const bad = renderToStaticMarkup(
    renderBuilderNodes([form], { formPrefill: { service: "ZZZ" } }),
  );
  assert.doesNotMatch(bad, /value="ZZZ"/);
  assert.match(bad, /<option[^>]*value=""[^>]*selected|<option[^>]*selected[^>]*value=""/);
});

test("no prefill option → no value attributes on inputs", () => {
  const html = renderToStaticMarkup(renderBuilderNodes([form], {}));
  assert.doesNotMatch(html, /name="name"[^>]*value=/);
  assert.doesNotMatch(html, /<option[^>]*value="A"[^>]*selected/);
});
