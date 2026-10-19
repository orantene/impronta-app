/**
 * B2/D3: a service with no online times shows the request path inline with
 * friendly copy (not the red error), the default service is the first one with
 * times, and the copy is Spanish on a Spanish workspace.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BookPageClient } from "./BookPageClient";
import { createTranslator } from "@/i18n/messages";
import { bookPagePaymentLine } from "@/lib/talent/who-step-payment-copy";

function offering(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title,
    talentProfileId: "t1",
    visibility: "public",
    reserveMode: "free",
    allowPayInPerson: true,
    durationMinutes: 30,
    amountCents: 5000,
    currency: "USD",
    bookingMode: "request",
    ...extra,
  } as never;
}

function render(offerings: unknown[], locale: string) {
  return renderToStaticMarkup(
    createElement(BookPageClient, {
      tenantSlug: "qa-journeys",
      agencyName: "QA",
      offerings: offerings as never,
      locale,
      contactHref: "/w/qa-journeys/contact",
    }),
  );
}

// Catches: the red dead end on the default service.
test("default service is the first one with times", () => {
  const html = render(
    [offering("a", "Cut", { hasOpenTimes: false }), offering("b", "Color", { hasOpenTimes: true })],
    "en",
  );
  assert.match(html, /data-book-selected="b"/);
  assert.doesNotMatch(html, /data-book-no-times/);
});

test("no service has times: inline request path, friendly copy, not red", () => {
  for (const [locale, copy] of [
    ["en", /No online times right now: send us a request and we will confirm/],
    ["es", /Sin horarios en línea por ahora: envíanos una solicitud y te confirmamos/],
  ] as const) {
    const html = render([offering("a", "Cut", { hasOpenTimes: false })], locale);
    assert.match(html, /data-book-no-times="a"/, locale);
    assert.match(html, copy, locale);
    assert.doesNotMatch(html, /dc2626|slot-picker/, locale);
    assert.doesNotMatch(html, /—/, "no em dash");
  }
});

test("on_request service goes straight to the request path", () => {
  const html = render([offering("a", "Quote", { visibility: "on_request" })], "es");
  assert.match(html, /data-book-no-times="a"/);
});

// Catches: English header/lead/payment lines on a Spanish workspace.
test("es copy present for header, lead and payment line", () => {
  const es = createTranslator("es");
  assert.equal(es("public.bookPage.title"), "Reserva un horario");
  assert.match(es("public.bookPage.lead"), /Elige un servicio/);
  const pay = bookPagePaymentLine(offering("a", "Cut") as never, "instant", "es");
  assert.match(pay, /No se cobra nada ahora\. El pago se realiza en el estudio\./);
  const html = render([offering("a", "Cut", { hasOpenTimes: true, bookingMode: "instant" })], "es");
  assert.match(html, /No se cobra nada ahora\. El pago se realiza en el estudio\./);
  assert.doesNotMatch(html, /Reserve a time|Pick a service|Nothing is charged now|Times are not available/);
});

// Catches: the drawer (usePublicT, cookie locale) speaking English on a Spanish
// workspace. Under the scope the page locale wins in both directions, whatever
// the cookie says.
test("page locale scope wins over the cookie locale, es and en", async () => {
  const { BookLocaleScope } = await import("./BookLocaleScope");
  const { usePublicT } = await import("@/i18n/use-public-t");
  function Probe() {
    return createElement("span", null, usePublicT()("public.bookPage.requestCta"));
  }
  const html = (locale: "en" | "es") =>
    renderToStaticMarkup(createElement(BookLocaleScope, { locale }, createElement(Probe)));
  assert.match(html("es"), /Enviar una solicitud/);
  assert.match(html("en"), /Send a request/);
  const client = readFileSync(join(__dirname, "BookPageClient.tsx"), "utf8");
  assert.match(client, /<BookLocaleScope locale=\{pageLocale\}>/);
});

// Catches: services beyond the probe limit showing an empty picker with no request button.
test("unprobed service: the picker empty state carries the request action", () => {
  const client = readFileSync(join(__dirname, "BookPageClient.tsx"), "utf8");
  assert.match(client, /emptyAction=\{\s*<BookNoTimesRequest\s+bare/);
  const comp = readFileSync(join(__dirname, "../../../components/public-booking/BookableComposer.tsx"), "utf8");
  assert.match(comp, /emptyAction=\{emptyAction\}/);
  const picker = readFileSync(join(__dirname, "../../../components/public-booking/SlotPicker.tsx"), "utf8");
  assert.match(picker, /\{emptyAction\}/);
  // used by both the empty and the failed-load branches
  assert.equal((picker.match(/\{contactLink\}/g) ?? []).length, 2);
});

// Evidence for house-owned services: the slots loader never returns times for them.
test("house-owned services never had times (no regression from false)", () => {
  const src = readFileSync(join(__dirname, "../../../lib/scheduling/public-open-times.ts"), "utf8");
  assert.match(src, /!offering\.talent_profile_id\) return \{ ok: true, slots: \[\], reason: "not_bookable_here" \}/);
});
