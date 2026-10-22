// TUL-1792: demo-talent photo alt text follows the site locale.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { looksEnglishAlt, resolvePortfolioAlt } from "./portfolio-i18n";
import { buildSuggestedAlt } from "./portfolio-alt-suggest";

const EN_ALT = "man in yellow and black shirt";
const suggest = (locale: string) =>
  buildSuggestedAlt({ name: "Diego Navarro", trade: "DJ", city: "Cancun" }, locale);

function resolve(locale: string, over: Partial<Parameters<typeof resolvePortfolioAlt>[0]> = {}) {
  return resolvePortfolioAlt({
    metadata: null,
    alt: EN_ALT,
    caption: null,
    displayName: "Diego Navarro",
    locale,
    primaryLocale: "es",
    suggested: suggest(locale),
    ...over,
  });
}

test("Spanish site: seeded English alt is replaced by a Spanish alt", () => {
  const alt = resolve("es");
  assert.notEqual(alt, EN_ALT);
  assert.equal(alt, "DJ por Diego Navarro en Cancun");
});

test("English site: English alt is kept", () => {
  assert.equal(resolve("en"), EN_ALT);
});

test("Spanish site with no data at all gets a Spanish generic label, not English", () => {
  const alt = resolve("es", { displayName: null, suggested: "" });
  assert.equal(alt, "Foto del portafolio");
});

test("ES-only talent: alt_i18n has only es, English visitor falls back to ES text", () => {
  const meta = { alt_i18n: { es: "Cabina de DJ con luces verdes" } };
  assert.equal(resolve("en", { metadata: meta, alt: null }), "Cabina de DJ con luces verdes");
  assert.equal(resolve("es", { metadata: meta, alt: EN_ALT }), "Cabina de DJ con luces verdes");
});

test("alt_i18n entry for the visitor locale always wins over the English column", () => {
  const meta = { alt_i18n: { es: "Hombre con camisa amarilla", en: EN_ALT } };
  assert.equal(resolve("es", { metadata: meta }), "Hombre con camisa amarilla");
});

test("Spanish base alt is never discarded", () => {
  assert.equal(resolve("es", { alt: "Retrato de Alba" }), "Retrato de Alba");
  assert.equal(resolve("en", { alt: "Retrato de Alba" }), "Retrato de Alba");
});

test("looksEnglishAlt is conservative", () => {
  assert.equal(looksEnglishAlt("person playing audio mixer with green lights"), true);
  assert.equal(looksEnglishAlt(EN_ALT), true);
  assert.equal(looksEnglishAlt("Manos con manicura en tonos suaves"), false);
  assert.equal(looksEnglishAlt("Diego Navarro"), false);
  assert.equal(looksEnglishAlt("Camión de DJ in"), false);
  assert.equal(looksEnglishAlt(null), false);
});

test("demo fixture sources hard-code no English alt literal", () => {
  const web = join(__dirname, "../../../..");
  const roots = [join(web, "scripts/demo-talents"), join(web, "src/lib/talent-site/demos")];
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts)$/.test(n) && !/\.test\./.test(n)) files.push(p);
    }
  };
  roots.forEach(walk);
  const offenders: string[] = [];
  const re = /\balt:\s*(?:"([^"]+)"|'([^']+)')/g;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(re)) {
      const lit = m[1] ?? m[2] ?? "";
      if (looksEnglishAlt(lit)) offenders.push(`${f}: ${lit}`);
    }
  }
  assert.deepEqual(offenders, []);
});
