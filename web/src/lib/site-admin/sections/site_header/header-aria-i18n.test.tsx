/**
 * TUL-1406: the shared site header's icon buttons (Saved, Your inquiry, Menu,
 * Phone, WhatsApp, Email) had hardcoded English aria-labels, so a screen reader
 * announced them in English on every Spanish page. They now come from one
 * helper (`@/i18n/site-header-labels`), the same shape as GRK-101's
 * `primaryNavAriaLabel`. A label the owner typed (`contact.label`) still wins.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { siteHeaderLabels } from "@/i18n/site-header-labels";
import { SiteHeaderComponent } from "./Component";

test("the helper: Spanish and English, and region tags like es-MX", () => {
  assert.deepEqual(siteHeaderLabels("es"), {
    saved: "Guardados",
    inquiry: "Tu consulta",
    menu: "Menú",
    phone: "Teléfono",
    whatsapp: "WhatsApp",
    email: "Correo",
  });
  assert.equal(siteHeaderLabels("en").saved, "Saved");
  assert.equal(siteHeaderLabels("en").inquiry, "Your inquiry");
  assert.equal(siteHeaderLabels("en").menu, "Menu");
  assert.equal(siteHeaderLabels("en").phone, "Phone");
  assert.equal(siteHeaderLabels("es-MX").menu, "Menú");
  assert.equal(siteHeaderLabels(null).menu, "Menu");
});

async function render(locale: string, extra: Record<string, unknown> = {}) {
  const el = await SiteHeaderComponent({
    props: {
      brand: { label: "Ana" },
      navItems: [
        { label: "Home", href: "/" },
        { label: "Work", href: "/work" },
      ],
      contactLinks: [{ type: "phone", value: "tel:+525512345678" }],
      regions: {
        left: [{ type: "brand" }],
        center: [],
        right: [
          { type: "phone" },
          { type: "inquiry", href: "/contact" },
          { type: "saved", href: "/saved" },
          { type: "nav", responsive: { mobile: "menu" } },
        ],
      },
      ...extra,
    } as never,
    sectionId: "hdr",
    tenantId: null,
    locale,
  } as never);
  return renderToStaticMarkup(el as never);
}

const labels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

test("an ES header announces Spanish labels, never the English ones", async () => {
  const html = await render("es");
  const l = labels(html);
  for (const spanish of ["Guardados", "Tu consulta", "Teléfono"]) assert.ok(l.includes(spanish), `${spanish} in ${l.join("|")}`);
  for (const english of ["Saved", "Your inquiry", "Phone", "Menu"]) assert.ok(!l.includes(english), `${english} must not appear in ${l.join("|")}`);
  assert.ok(l.includes("Menú"), `Menú in ${l.join("|")}`);
});

test("an EN header keeps the English labels", async () => {
  const l = labels(await render("en"));
  for (const english of ["Saved", "Your inquiry", "Phone", "Menu"]) assert.ok(l.includes(english), `${english} in ${l.join("|")}`);
});

test("an owner-typed contact label still wins over the localised default", async () => {
  const l = labels(await render("es", { contactLinks: [{ type: "phone", value: "tel:+525512345678", label: "Llámame" }] }));
  assert.ok(l.includes("Llámame"));
  assert.ok(!l.includes("Teléfono"));
});
