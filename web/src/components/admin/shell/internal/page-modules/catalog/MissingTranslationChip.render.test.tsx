import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { listLocales } from "@/lib/talent/offering-missing-translation";
import { MissingTranslationChip } from "./MissingTranslationChip";

const COPY: Record<string, string> = {
  "dashboard.catalog.list.langMissing": "Falta {lang}",
  "dashboard.catalog.list.langMissingHint": "Aún no tiene título en {language}",
};
const t = (key: string) => COPY[key] ?? key;

// The PM's case: an empty client store (one language) but the server says the
// talent has English + Spanish. The chip must follow the server settings.
const emptyStore = { primary: "en", locales: ["en"] };
const server = { primary: "en", secondary: ["es"] };

function render(item: { title: string; titleI18n?: Record<string, string> }, s: typeof server | null) {
  const { primary, locales } = listLocales(s, emptyStore);
  return renderToStaticMarkup(
    <MissingTranslationChip item={item} primary={primary} locales={locales} uiLocale="es" t={t} />,
  );
}

test("two-language talent, item without a Spanish title: the chip renders even with an empty store", () => {
  const html = render({ title: "Semi-permanent gel" }, server);
  assert.match(html, /data-testid="catalog-row-lang-missing"/);
  assert.match(html, /Falta ES/);
});

test("two-language talent, item with both titles: no chip", () => {
  const html = render({ title: "Haircut", titleI18n: { es: "Corte" } }, server);
  assert.equal(html, "");
});

test("no server settings and an empty store: fails closed, no chip", () => {
  assert.equal(render({ title: "Semi-permanent gel" }, null), "");
});

test("listLocales: server wins and puts the primary first; store is the fallback", () => {
  assert.deepEqual(listLocales({ primary: "es", secondary: ["en", "es"] }, emptyStore), { primary: "es", locales: ["es", "en"] });
  assert.deepEqual(listLocales(null, emptyStore), emptyStore);
});
