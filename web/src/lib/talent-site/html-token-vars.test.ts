import test from "node:test";
import assert from "node:assert/strict";

import { buildHtmlTokenVarsCss, pickHtmlTokenAttrs } from "./html-token-vars";

test("builds one html rule with important declarations", () => {
  const css = buildHtmlTokenVarsCss({
    "--token-color-primary": "#111111",
    "--site-body-font": '"Inter", sans-serif',
  });
  assert.equal(
    css,
    'html{--token-color-primary:#111111 !important;--site-body-font:"Inter", sans-serif !important}',
  );
});

test("empty input yields an empty string, not an empty rule", () => {
  assert.equal(buildHtmlTokenVarsCss({}), "");
  assert.equal(buildHtmlTokenVarsCss({ "--a": "   " }), "");
});

test("drops names and values that could break out of the rule or the style element", () => {
  const css = buildHtmlTokenVarsCss({
    "--ok": "red",
    "color": "red",
    "--bad name": "red",
    "--close": "red;} body{display:none",
    "--tag": "</style><script>x</script>",
    "--newline": "red\nblue",
  });
  assert.equal(css, "html{--ok:red !important}");
});

test("pickHtmlTokenAttrs keeps only data-token-* with safe values", () => {
  assert.deepEqual(
    pickHtmlTokenAttrs({
      "data-token-type-system": "editorial",
      "data-other": "x",
      "data-token-bad": "a<b",
      "data-token-empty": "",
    }),
    { "data-token-type-system": "editorial" },
  );
});
