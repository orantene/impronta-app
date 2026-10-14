import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { DateFormatHint } from "./DateFormatHint";

test("TUL-721: Spanish date inputs get a dd/mm/aaaa hint, English none", () => {
  assert.match(renderToStaticMarkup(<DateFormatHint locale="es" />), /dd\/mm\/aaaa/);
  assert.equal(renderToStaticMarkup(<DateFormatHint locale="en" />), "");
});
