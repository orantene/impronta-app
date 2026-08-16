import assert from "node:assert/strict";
import test from "node:test";

import { pickShellPageForLocale } from "./shell-page-pick";

const EN = { id: "page-en", locale: "en" };
const ES = { id: "page-es", locale: "es" };
const DE = { id: "page-de", locale: "de" };

test("a bilingual tenant resolves a page instead of nothing", () => {
  // The regression: `.maybeSingle()` answered this exact input with an error
  // and null, which the inspector read as "this site has no shell header".
  assert.equal(pickShellPageForLocale([EN, ES], "en")?.id, "page-en");
  assert.equal(pickShellPageForLocale([ES, EN], "en")?.id, "page-en");
});

test("the tenant's default locale wins regardless of row order", () => {
  assert.equal(pickShellPageForLocale([EN, ES, DE], "es")?.id, "page-es");
  assert.equal(pickShellPageForLocale([DE, ES, EN], "es")?.id, "page-es");
});

test("with no page for the default locale the pick is stable, not arbitrary", () => {
  // Load and save call this separately. If the fallback depended on row order
  // they could disagree and a CAS write would land on a page the operator was
  // never looking at.
  const a = pickShellPageForLocale([ES, DE], "en");
  const b = pickShellPageForLocale([DE, ES], "en");
  assert.equal(a?.id, b?.id);
  assert.equal(a?.id, "page-de");
});

test("a missing locale never outranks a real one", () => {
  const orphan = { id: "page-null", locale: null };
  assert.equal(pickShellPageForLocale([orphan, ES], "en")?.id, "page-es");
  assert.equal(pickShellPageForLocale([orphan], "en")?.id, "page-null");
});

test("no pages means no page", () => {
  assert.equal(pickShellPageForLocale([], "en"), null);
});

test("a single page is used whatever the preferred locale is", () => {
  assert.equal(pickShellPageForLocale([ES], "en")?.id, "page-es");
  assert.equal(pickShellPageForLocale([ES], null)?.id, "page-es");
});
