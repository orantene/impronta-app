/**
 * TUL-698: a workspace with no bookable services must not say "No open times
 * in the next two weeks" (the reason is "no services", not "fully booked"),
 * must speak the page locale, and must offer a way forward (contact link).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BookPageClient } from "./BookPageClient";

function render(locale: string) {
  return renderToStaticMarkup(
    createElement(BookPageClient, {
      tenantSlug: "qa-grok-workspace",
      agencyName: "QA",
      offerings: [],
      locale,
      contactHref: "/w/qa-grok-workspace/contact",
    }),
  );
}

// Catches: empty /book read "No open times" (wrong reason) with no next step.
test("no services: reason-specific copy and a contact link, ES and EN", () => {
  for (const locale of ["es", "en"]) {
    const html = render(locale);
    assert.doesNotMatch(html, /No open times|No hay horarios/i, locale);
    assert.match(html, /href="\/w\/qa-grok-workspace\/contact"/, locale);
    assert.doesNotMatch(html, /—/, "no em dash");
  }
  assert.match(render("es"), /Escr[ií]benos|Enviar un mensaje/);
  assert.match(render("en"), /Send a message/);
});
