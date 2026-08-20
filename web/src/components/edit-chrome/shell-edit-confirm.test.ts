import assert from "node:assert/strict";
import test from "node:test";

import { buildShellEditorPathFromPathname } from "./shell-edit-confirm";

test("shell editor path keeps whatever storefront base the operator is on", () => {
  const cases: Array<[string, string]> = [
    ["/w/impronta", "/w/impronta/p/__site_shell__?edit=1"],
    ["/w/impronta/", "/w/impronta/p/__site_shell__?edit=1"],
    ["/w/impronta/p/about", "/w/impronta/p/__site_shell__?edit=1"],
    ["/es/w/impronta/p/about", "/es/w/impronta/p/__site_shell__?edit=1"],
    ["/p/about", "/p/__site_shell__?edit=1"],
    ["/", "/p/__site_shell__?edit=1"],
    ["/es/p/faq", "/es/p/__site_shell__?edit=1"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(buildShellEditorPathFromPathname(input), expected, input);
  }
});
