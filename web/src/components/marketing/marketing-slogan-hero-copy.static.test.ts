/**
 * TUL-593 + TUL-594: header slogan is "Sell what you do" tucked under the
 * logo, and the home hero carries the approved copy (ES + EN).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getMarketingCopy } from "@/lib/marketing/copy";

const header = readFileSync(
  join(process.cwd(), "src/components/marketing/header.tsx"),
  "utf8",
);
const hero = readFileSync(
  join(process.cwd(), "src/components/marketing/hero-section.tsx"),
  "utf8",
);

test("TUL-593: slogan strings are short, no em dashes", () => {
  assert.equal(getMarketingCopy("en").brand.descriptor, "Sell what you do");
  assert.equal(getMarketingCopy("es").brand.descriptor, "Vende lo que haces");
});

test("TUL-593: slogan sits under the logo at every width, with a tight gap", () => {
  const start = header.indexOf("function TulalaHeaderLogo");
  const logo = header.slice(start);
  assert.match(logo, /mt-0\.5/);
  assert.doesNotMatch(logo, /hidden[^"]*sm:block/);
  assert.ok(!header.includes("-mt-1 text-[0.5625rem]"), "no separate phone row");
});

test("TUL-594: hero copy is the approved final copy", () => {
  const en = getMarketingCopy("en").hero;
  assert.equal(en.eyebrow, "Built for professionals and service businesses");
  assert.equal(en.titleLine1, "Your business.");
  assert.equal(en.titleLine2, "All in one place.");
  assert.equal(
    en.subhead,
    "Create your website, showcase your services, take bookings, send quotes, collect payments and manage your clients. Everything works together.",
  );
  assert.equal(en.ctaTalent, "Start free");
  assert.equal(en.ctaBusiness, "See how it works");
  assert.deepEqual(en.trust, [
    "Website",
    "Services",
    "Bookings",
    "Chat & Quotes",
    "Payments",
    "Clients & Team",
  ]);
  const es = getMarketingCopy("es").hero;
  assert.equal(es.eyebrow, "Para profesionales y negocios de servicios");
  assert.equal(es.titleLine1, "Todo tu negocio.");
  assert.equal(es.titleLine2, "En un solo lugar.");
  assert.equal(
    es.subhead,
    "Crea tu página web, muestra tus servicios, recibe citas, envía cotizaciones, cobra y administra a tus clientes. Todo conectado.",
  );
  assert.equal(es.ctaTalent, "Empieza gratis");
  assert.equal(es.ctaBusiness, "Descubre cómo funciona");
  assert.deepEqual(es.trust, [
    "Página web",
    "Servicios",
    "Citas",
    "Chat y cotizaciones",
    "Cobros",
    "Clientes y equipo",
  ]);
  for (const s of [JSON.stringify(en), JSON.stringify(es)]) {
    assert.ok(!s.includes("—"), "no em dashes");
  }
});

test("TUL-594: secondary hero CTA points to how-it-works", () => {
  assert.match(hero, /withLocaleHref\("\/how-it-works", locale\)/);
});
