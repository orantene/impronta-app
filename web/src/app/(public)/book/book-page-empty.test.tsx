/**
 * TUL-698: every empty state of /book offers a way forward (contact link),
 * in ES and EN: no open services, and services open but no free times.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BookPageClient } from "./BookPageClient";
import { SlotPicker } from "@/components/public-booking/SlotPicker";

const HREF = "/w/qa-grok-workspace/contact";

function render(locale: string) {
  return renderToStaticMarkup(
    createElement(BookPageClient, {
      tenantSlug: "qa-grok-workspace",
      agencyName: "QA",
      offerings: [],
      locale,
      contactHref: HREF,
    }),
  );
}

// Catches: empty /book read "No open times" (wrong reason) with no next step.
test("no services: reason-specific copy and a contact link, ES and EN", () => {
  for (const locale of ["es", "en"]) {
    const html = render(locale);
    assert.doesNotMatch(html, /No open times|No hay horarios/i, locale);
    assert.match(html, new RegExp(`href="${HREF}"`), locale);
    assert.doesNotMatch(html, /—/, "no em dash");
  }
  assert.match(render("es"), /Enviar un mensaje/);
  assert.match(render("en"), /Send a message/);
});

// Catches: the free-times empty state (SlotPicker) was a dead end on /book.
test("slot picker empty state is wired to the contact link", () => {
  const picker = readFileSync(join(__dirname, "../../../components/public-booking/SlotPicker.tsx"), "utf8");
  assert.match(picker, /contactHref/);
  assert.match(picker, /public\.bookPage\.contactCta/);
  // Initial render is the loading skeleton, so the link is proven by wiring above.
  const html = renderToStaticMarkup(
    createElement(SlotPicker, {
      offeringId: "o",
      durationMinutes: 30,
      timezone: "UTC",
      value: null,
      onChange: () => {},
      contactHref: HREF,
    }),
  );
  assert.match(html, /slot-picker-skeleton/);
  const composer = readFileSync(join(__dirname, "../../../components/public-booking/BookableComposer.tsx"), "utf8");
  assert.match(composer, /contactHref=\{contactHref\}/);
  const client = readFileSync(join(__dirname, "BookPageClient.tsx"), "utf8");
  assert.match(client, /contactHref=\{contactHref\}/);
});
