/**
 * TUL-345: on a tenant whose default locale is es, the kit blocks' base text is
 * read as es, so an English visitor got the es overlay. Both blocks now carry
 * an explicit en overlay; /en must render no Spanish.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { aftercareBlock } from "@/lib/talent-site/theme-catalog/section-kit-aftercare";
import { beforeAfterBlock } from "@/lib/talent-site/theme-catalog/section-kit-before-after";

import { renderBuilderNodes } from "./render";
import { validateBuilderNodeTree } from "./validate";

let n = 0;
const makeId = () => `n${++n}`;
const SPANISH = /Cuidados|Sigue los pasos|Preg[uú]ntame|Planea tu|Después|Si algo no|visitas regulares|La diferencia|Antes y después/;

function html(raw: unknown, locale: string) {
  // Stored sites go through validate, which mirrors props.i18n onto node.i18n.
  const res = validateBuilderNodeTree([raw]);
  if (!res.ok) assert.fail(JSON.stringify(res.issues));
  const node = res.tree[0]!;
  return renderToStaticMarkup(
    <>{renderBuilderNodes([node], { contentLocale: { locale, defaultLocale: "es", chain: [locale, "es"] } })}</>,
  );
}

describe("kit blocks on an es-default tenant", () => {
  it("aftercare renders English on /en and Spanish on /es", () => {
    const en = html(aftercareBlock(makeId), "en");
    assert.doesNotMatch(en, SPANISH);
    assert.match(en, /Aftercare tips/);
    assert.match(en, /Follow the care steps/);
    assert.match(en, /Plan your next visit/);
    const es = html(aftercareBlock(makeId), "es");
    assert.match(es, /Cuidados posteriores/);
    assert.match(es, /Planea tu próxima visita/);
  });

  it("before/after renders no Spanish on /en", () => {
    const en = html(beforeAfterBlock(makeId, {}), "en");
    assert.doesNotMatch(en, SPANISH);
  });
});
