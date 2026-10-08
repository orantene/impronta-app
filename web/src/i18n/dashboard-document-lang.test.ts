import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardDocumentLang } from "./dashboard-document-lang";

test("dashboard document lang follows the dashboard locale", () => {
  assert.equal(dashboardDocumentLang("es"), "es");
  assert.equal(dashboardDocumentLang("en"), "en");
  assert.equal(dashboardDocumentLang("fr"), "fr");
  assert.equal(dashboardDocumentLang("xx-YY"), "xx");
});
test("empty locale leaves the server value alone", () => {
  assert.equal(dashboardDocumentLang(""), null);
  assert.equal(dashboardDocumentLang(undefined), null);
});
