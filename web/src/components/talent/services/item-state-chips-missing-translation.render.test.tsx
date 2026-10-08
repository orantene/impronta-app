import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { listLocales } from "@/lib/talent/offering-missing-translation";
import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";
import { ItemStateChips } from "./ItemStateChips";

// Seeded locales: what the talent layout hands the shell. The client store is
// empty (one language) in the PM's case, so the server settings must win.
const emptyStore = { primary: "en", locales: ["en"] };
const twoLang = listLocales({ primary: "en", secondary: ["es"] }, emptyStore);
const oneLang = listLocales({ primary: "en", secondary: [] }, emptyStore);

function item(title: string, titleI18n?: Record<string, string>): TalentOffering {
  return { ...blankOffering("talent-1", "USD", 0), id: "o1", title, titleI18n };
}

const CHIP = /data-testid="catalog-row-lang-missing"/;

test("Services home rows: two-language talent, Spanish title missing: chip shows", () => {
  const html = renderToStaticMarkup(
    <ItemStateChips item={item("Gel manicure")} locale="es" primary={twoLang.primary} locales={twoLang.locales} />,
  );
  assert.match(html, CHIP);
  assert.match(html, /Falta ES/);
});

test("Services home rows: English UI says 'ES missing'", () => {
  const html = renderToStaticMarkup(
    <ItemStateChips item={item("Gel manicure")} locale="en" primary={twoLang.primary} locales={twoLang.locales} />,
  );
  assert.match(html, /ES missing/);
});

test("Services home rows: complete service has no chip", () => {
  const html = renderToStaticMarkup(
    <ItemStateChips item={item("Haircut", { es: "Corte" })} locale="es" primary={twoLang.primary} locales={twoLang.locales} />,
  );
  assert.doesNotMatch(html, CHIP);
});

test("Services home rows: one-language talent has no chip", () => {
  const html = renderToStaticMarkup(
    <ItemStateChips item={item("Gel manicure")} locale="es" primary={oneLang.primary} locales={oneLang.locales} />,
  );
  assert.doesNotMatch(html, CHIP);
});

test("Services home rows: caller that passes no locales draws no chip", () => {
  assert.doesNotMatch(renderToStaticMarkup(<ItemStateChips item={item("Gel manicure")} locale="es" />), CHIP);
});

test("Services home rows: two-language talent, missing translation: chip shows", () => {
  const html = renderToStaticMarkup(
    <ItemStateChips item={item("Gel manicure")} locale="es" primary={twoLang.primary} locales={twoLang.locales} />,
  );
  assert.match(html, CHIP);
});

test("Services home rows: complete service and one-language talent: no chip", () => {
  const done = renderToStaticMarkup(
    <ItemStateChips item={item("Haircut", { es: "Corte" })} locale="es" primary={twoLang.primary} locales={twoLang.locales} />,
  );
  assert.doesNotMatch(done, CHIP);
  const single = renderToStaticMarkup(
    <ItemStateChips item={item("Gel manicure")} locale="es" primary={oneLang.primary} locales={oneLang.locales} />,
  );
  assert.doesNotMatch(single, CHIP);
});
