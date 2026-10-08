/**
 * DS-62 (TUL-121 design polish): bookable header CTA + Spanish button casing.
 * Kept as a named suite so the finding ID is easy to find in CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { localiseSeededDesignLabel } from "./design-label-locale";
import { localiseTalentHeaderDefaults } from "./header-cta-locale";

test("DS-62: Inquire seed follows booking mode in design labels", () => {
  assert.equal(localiseSeededDesignLabel("Inquire", "es-MX", "instant"), "Reservar");
  assert.equal(localiseSeededDesignLabel("Inquire", "es-MX", "request"), "Solicitar cita");
  assert.equal(localiseSeededDesignLabel("Inquire", "es-MX", "inquiry"), "Escríbeme");
  assert.equal(localiseSeededDesignLabel("Inquire", "en", "instant"), "Book now");
});

test("DS-62: already-localised Escríbeme becomes Reservar on instant sites", () => {
  const props = { primaryCta: { label: "Escríbeme", href: "/contact" } };
  const out = localiseTalentHeaderDefaults(props, "es", "instant") as typeof props;
  assert.equal(out.primaryCta.label, "Reservar");
  assert.equal(out.primaryCta.href, "#services");
});

test("DS-62: token-presets keep sentence case for Spanish .site-btn", () => {
  const css = readFileSync(path.join(__dirname, "../../app/token-presets.css"), "utf8");
  const idx = css.indexOf('html[lang^="es"] .site-btn');
  assert.ok(idx > 0);
  assert.match(css.slice(idx, idx + 120), /text-transform:\s*none/);
});
