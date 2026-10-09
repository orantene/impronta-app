import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TypeSystemStyle,
  typeSystemSheetsForTokens,
} from "./design-type-system-style";

test("omitted systems → all sheets (editor default)", () => {
  const html = renderToStaticMarkup(<TypeSystemStyle />);
  for (const id of ["editorial", "magazine", "utility", "utility-booking", "highlight", "motion"]) {
    assert.match(html, new RegExp(`data-type-system-style="${id}"`));
  }
});

test("scoped systems → only requested sheets", () => {
  const html = renderToStaticMarkup(
    <TypeSystemStyle systems={["editorial", "motion"]} />,
  );
  assert.match(html, /data-type-system-style="editorial"/);
  assert.match(html, /data-type-system-style="motion"/);
  assert.doesNotMatch(html, /data-type-system-style="magazine"/);
  assert.doesNotMatch(html, /data-type-system-style="utility"/);
});

test("typeSystemSheetsForTokens: utility includes booking sheet + highlight", () => {
  assert.deepEqual(
    [...typeSystemSheetsForTokens({ "type.system": "utility", "type.accent-style": "highlight" })].sort(),
    ["highlight", "motion", "utility", "utility-booking"],
  );
});
