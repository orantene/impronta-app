import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";

/**
 * TUL-999: the Portfolio, Services catalog and Comp card inspectors edited
 * their copy through single plain inputs, so on a Spanish site the inspector
 * showed the English base value ("Selected work") while the canvas showed the
 * Spanish overlay ("Trabajos elegidos"), and the Spanish text could not be
 * edited. Every localizable copy prop now goes through the shared per-language
 * field.
 */
const FILES = [
  { file: "portfolio-inspector.tsx", kind: "portfolio" as const },
  { file: "services-catalog-inspector.tsx", kind: "services_catalog" as const },
  { file: "comp-card-inspector.tsx", kind: "comp_card" as const },
];

for (const { file, kind } of FILES) {
  const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
  const localizable = localizablePropsForKind(kind);

  test(`${file}: no plain input writes a localizable prop`, () => {
    for (const prop of localizable) {
      assert.doesNotMatch(
        src,
        new RegExp(`commitPatch\\(\\{\\s*${prop}:\\s*e\\.target\\.value`),
        `${kind}.${prop} is localizable but still edited through a plain input`,
      );
    }
  });

  test(`${file}: copy fields use the shared per-language field on localizable props`, () => {
    assert.match(src, /LocalizableTextField: LocalizableTextFieldComponent/);
    const used = [...src.matchAll(/textField\(\s*"(\w+)"/g)].map((m) => m[1]);
    assert.ok(used.length > 0, "no textField(...) call found");
    for (const prop of used) {
      assert.ok(
        localizable.includes(prop),
        `${kind}.${prop} is wired as a per-language field but is not in builder-i18n-props`,
      );
    }
  });
}

test("builder-node-content passes the shared field and tenantId to all three", () => {
  const src = readFileSync(new URL("./builder-node-content.tsx", import.meta.url), "utf8");
  for (const name of ["PortfolioContentInspector", "ServicesCatalogContentInspector", "CompCardContentInspector"]) {
    const at = src.indexOf(`<${name}`);
    assert.ok(at > 0, `${name} not rendered`);
    const call = src.slice(at, at + 260);
    assert.match(call, /tenantId=\{tenantId\}/, `${name} gets no tenantId`);
    assert.match(call, /LocalizableTextField=\{BuilderNodeLocalizableTextField\}/, `${name} gets no shared field`);
  }
});
