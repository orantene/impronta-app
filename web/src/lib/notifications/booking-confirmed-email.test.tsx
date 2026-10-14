/**
 * TUL-852: the booking confirmation emails name the service, the date and the
 * price in the booking's currency, and the greeting never repeats a name or
 * says "Hola hola".
 */
import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ClientBookingConfirmed from "../../../emails/client/BookingConfirmed";
import TalentBookingConfirmed from "../../../emails/talent/BookingConfirmed";
import { bookingGreeting, bookingSellerName, brandForSeller, formatBookingPrice, pickServiceName } from "./booking-confirmed-email";
import { getEmailCopy } from "./email-copy";

const client = (locale: string, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(ClientBookingConfirmed, {
      clientName: "QA Guest",
      contactName: "QA Guest",
      eventDate: "mié 14 oct, 13:30 - 14:30",
      eventLocation: null,
      serviceName: "Corte de cabello",
      priceLabel: "$800 MXN",
      bookingUrl: "https://x.test/b",
      brand: { locale },
      ...extra,
    }),
  );

const talent = (locale: string, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(TalentBookingConfirmed, {
      talentName: null,
      contactName: "QA Guest",
      eventDate: "mié 14 oct, 13:30 - 14:30",
      eventLocation: null,
      serviceName: "Corte de cabello",
      priceLabel: "$800 MXN",
      inquiriesUrl: "https://x.test/i",
      brand: { locale },
      ...extra,
    }),
  );

test("ES client email: service, date, price, one clean greeting", () => {
  const html = client("es");
  assert.match(html, /Hola QA Guest, tu reserva quedó confirmada\./);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /\$800 MXN/);
  assert.match(html, /mié 14 oct/);
  assert.doesNotMatch(html, /QA Guest, QA Guest/);
});

test("EN client email: service, date, price, one clean greeting", () => {
  const html = client("en");
  assert.match(html, /Hi QA Guest, your booking is confirmed\./);
  assert.match(html, /Service/);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /\$800 MXN/);
});

test("client email with no service or price drops those rows without 'undefined'", () => {
  const html = client("es", { serviceName: null, priceLabel: null });
  assert.doesNotMatch(html, /Servicio|Precio|undefined|null/);
});

test("ES talent email with no talent name reads 'Hola,' not 'Hola hola'", () => {
  const html = talent("es");
  assert.match(html, /Hola, una nueva reserva quedó confirmada\./);
  assert.doesNotMatch(html, /[Hh]ola,? hola/);
  assert.match(html, /Corte de cabello/);
  assert.match(html, /\$800 MXN/);
  assert.match(html, /QA Guest/);
});

test("EN talent email greets by name and omits a hidden price", () => {
  const html = talent("en", { talentName: "Jor", priceLabel: null });
  assert.match(html, /Hi Jor, a new booking is confirmed\./);
  assert.doesNotMatch(html, /Price|800/);
});

test("copy parity: ES values are not the English sentences", () => {
  for (const key of ["client.booking_confirmed", "talent.booking_confirmed"] as const) {
    const en = getEmailCopy("en")[key] as Record<string, string>;
    const es = getEmailCopy("es")[key] as Record<string, string>;
    for (const k of ["intro", "greetingNamed", "greetingAnon"]) assert.notEqual(en[k], es[k], `${key}.${k}`);
  }
});

test("helpers", () => {
  const t = { greetingNamed: "Hi {name},", greetingAnon: "Hi," };
  assert.equal(bookingGreeting(t, "  Ana "), "Hi Ana,");
  assert.equal(bookingGreeting(t, "   "), "Hi,");
  assert.equal(pickServiceName({ offeringTitle: "Facial", bookingTitle: "x" }), "Facial");
  assert.equal(pickServiceName({ bookingTitle: "Booking" }), null);
  assert.equal(pickServiceName({ bookingTitle: "QA Guest", contactName: "qa guest" }), null);
  assert.equal(pickServiceName({ bookingTitle: "Manicure" }), "Manicure");
  assert.equal(formatBookingPrice("800.00", "mxn", "es"), "$800 MXN");
  assert.equal(formatBookingPrice(0, "MXN", "es"), null);
  assert.equal(formatBookingPrice(800, null, "es"), null);
});

// ---- TUL-853: signed by the talent, not "Impronta Hub" ----

const hubBrand = { wordmark: "IMPRONTA HUB", accountName: "Impronta Hub", logoUrl: "https://x.test/hub.png", locale: "es" };

test("hub booking with one talent is signed by that talent", () => {
  const seller = bookingSellerName({ workspaceType: null, kind: "hub", planTier: "network", talentNames: ["Jorgelina Beauty"] });
  assert.equal(seller, "Jorgelina Beauty");
  const b = brandForSeller(hubBrand, seller);
  assert.equal(b.accountName, "Jorgelina Beauty");
  assert.equal(b.wordmark, "JORGELINA BEAUTY");
  assert.equal(b.logoUrl, null);
});

test("hub booking with several or no talent keeps the workspace brand", () => {
  assert.equal(bookingSellerName({ workspaceType: null, kind: "hub", planTier: "network", talentNames: ["A", "B"] }), null);
  assert.equal(bookingSellerName({ workspaceType: null, kind: "hub", planTier: "network", talentNames: [] }), null);
  assert.equal(brandForSeller(hubBrand, null), hubBrand);
});

test("a talent workspace is signed by its owner; an agency keeps its own brand", () => {
  assert.equal(bookingSellerName({ workspaceType: "talent", kind: null, planTier: "pro", talentNames: ["Jor"], ownerTalentName: "Jor" }), "Jor");
  assert.equal(bookingSellerName({ workspaceType: "agency", kind: "agency", planTier: "agency", talentNames: ["Jor"] }), null);
});

test("ES and EN emails render the talent brand and never 'Impronta Hub'", () => {
  for (const locale of ["es", "en"]) {
    const brand = brandForSeller({ ...hubBrand, locale }, "Jorgelina Beauty");
    for (const html of [client(locale, { brand, sellerName: brand.accountName }), talent(locale, { brand })]) {
      assert.match(html, /JORGELINA BEAUTY/);
      assert.doesNotMatch(html, /Impronta Hub|IMPRONTA HUB/i);
    }
  }
});
