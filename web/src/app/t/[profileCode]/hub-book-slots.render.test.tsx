import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FreeformHubBookBar } from "./freeform-hub-book";
import { HubProfileCta } from "./hub-profile-book-cta";
import type { HubProfileCtaSlot } from "@/lib/talent-site/hub-profile-book-cta";

const count = (html: string, needle: string) => html.split(needle).length - 1;

const slot = (s: HubProfileCtaSlot, hasBookableServices = true) =>
  renderToStaticMarkup(
    createElement(
      HubProfileCta,
      {
        platformHost: true,
        hasBookableServices,
        locale: "en",
        className: "btn",
        slot: s,
      },
      createElement("button", { "data-inquire": "" }, "Inquire"),
    ),
  );

test("bookable: header, sidebar and footer each render exactly one Book, no ids, no Inquire stacked", () => {
  for (const s of ["header", "sidebar", "footer"] as const) {
    const html = slot(s, true);
    assert.equal(count(html, "data-hub-book-cta"), 1, s);
    assert.equal(count(html, `data-hub-book-slot="${s}"`), 1, s);
    assert.equal(count(html, " id="), 0, `${s} must not carry an id (several slots share a page)`);
    assert.equal(count(html, "data-inquire"), 0, s);
    assert.ok(html.includes('href="#book"'), s);
    assert.ok(html.includes("Book"), s);
  }
});

test("all three bookable slots together never repeat an id", () => {
  const html = ["header", "sidebar", "footer"].map((s) => slot(s as HubProfileCtaSlot, true)).join("");
  assert.equal(count(html, "data-hub-book-cta"), 3);
  assert.equal(count(html, " id="), 0);
});

test("non-bookable keeps Inquire in every slot", () => {
  for (const s of ["header", "sidebar", "footer"] as const) {
    const html = slot(s, false);
    assert.equal(count(html, "data-hub-book-cta"), 0, s);
    assert.equal(count(html, "data-inquire"), 1, s);
  }
});

test("bookable freeform hub shows Book to #book", () => {
  const html = renderToStaticMarkup(
    createElement(FreeformHubBookBar, { hasBookableServices: true, locale: "en" }),
  );
  assert.equal(count(html, "data-hub-book-cta"), 1);
  assert.equal(count(html, 'data-hub-book-slot="freeform"'), 1);
  assert.ok(html.includes('href="#book"'));
});

test("non-bookable freeform hub shows nothing", () => {
  const none = renderToStaticMarkup(
    createElement(FreeformHubBookBar, { hasBookableServices: false, locale: "en" }),
  );
  assert.equal(none, "");
});

test("Spanish Book label on a bookable slot", () => {
  const html = renderToStaticMarkup(
    createElement(HubProfileCta, {
      platformHost: true,
      hasBookableServices: true,
      locale: "es",
      className: "btn",
      slot: "header",
    }),
  );
  assert.ok(html.includes("Reservar"));
  assert.ok(html.includes('href="#book"'));
});
