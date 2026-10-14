import test from "node:test";
import assert from "node:assert/strict";

import { documentLangBootstrapScript, documentLangToken } from "./document-lang";

test("documentLangToken accepts en / es (and BCP-47 variants)", () => {
  assert.equal(documentLangToken("en"), "en");
  assert.equal(documentLangToken("ES"), "es");
  assert.equal(documentLangToken("es-MX"), "es-mx");
  assert.equal(documentLangToken(""), null);
  assert.equal(documentLangToken("en; DROP"), null);
});

test("documentLangBootstrapScript pins html lang for the rendered body locale", () => {
  assert.equal(documentLangBootstrapScript("en"), 'document.documentElement.lang="en";');
  assert.equal(documentLangBootstrapScript("es"), 'document.documentElement.lang="es";');
  assert.equal(documentLangBootstrapScript(null), null);
});
